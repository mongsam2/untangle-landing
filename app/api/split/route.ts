import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type {
  Answer,
  Provider,
  SplitRequest,
  SplitResult,
  Task,
} from "@/components/split/types";
import { asRequestedProvider, resolveProvider } from "@/lib/llm";

/**
 * 쪼개기(Split) feature backend — docs/features/03-demo-split.md.
 *
 * Drives the Co-Planner conversation with an LLM: on each `advance` turn it
 * either asks one freely-chosen clarify question or decomposes the goal into
 * ≤5 tasks plus an immediate first step. 서브태스크 단위 재분해는 없다 —
 * 결과가 마음에 들지 않으면 같은 advance를 다시 보내 전체를 재생성한다.
 *
 * 질문 정책: 답변이 2개 모이기 전에는 반드시 질문한다(최소 2개 보장 —
 * 사용자가 "그냥 이대로 쪼개줘"로 건너뛴 경우만 예외). 2개가 모이면 더 묻지
 * 않고 분해한다. 서버가 답변 개수 기준으로 조향하고, 위반 시 1회 강제
 * 재요청한다. 무엇을 물을지는 모델이 정한다 — 고정된 맥락 체크리스트 없음.
 * `advance` optionally takes `context` (예: 브레인덤프 원문) so items already
 * evident there are never asked again.
 *
 * The user can pick the provider (Claude or GPT); both are asked to return the
 * same JSON shape. The conversation is stateless: the client sends the full
 * goal + answer history on every request, so no server-side session is needed.
 */

export const runtime = "nodejs";

const CLAUDE_MODEL = "claude-sonnet-5";
const OPENAI_MODEL = "gpt-4o"; // change here to use another GPT model
// 기본 상한 5. 다시 쪼개기를 거듭하면 클라이언트가 8, 10으로 올려 보낸다.
const DEFAULT_MAX_TASKS = 5;
const MAX_TASKS_LIMIT = 10;
// 분해 전 반드시 받아야 하는 답변 수 — 사용자가 스킵하면 예외.
const QUESTION_MIN = 2;
const SKIP_HINT = "그냥 이대로 쪼개줘";

const skipRequested = (answers: Answer[]): boolean =>
  answers.some((a) => a.answer.includes(SKIP_HINT));

const taskSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title"],
  properties: { title: { type: "string" } },
};

const ADVANCE_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["status", "message", "question", "tasks", "firstStep"],
  properties: {
    status: { type: "string", enum: ["need_more", "ready"] },
    message: { type: "string" },
    question: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["text", "options"],
          properties: {
            text: { type: "string" },
            options: { type: "array", items: { type: "string" } },
          },
        },
      ],
    },
    tasks: { anyOf: [{ type: "null" }, { type: "array", items: taskSchema }] },
    firstStep: { anyOf: [{ type: "null" }, taskSchema] },
  },
};

const advanceSystem = (
  maxTasks: number,
) => `당신은 "Untangle"의 Co-Planner예요. 사용자가 '목표만 있는 큰 일'을 가져오면, 그 일을 실제로 시작할 수 있도록 작은 실행 단위로 쪼개주는 역할을 합니다.

# 진행 방식
1. 답변이 2개 미만이면 아직 분해하지 마세요. status를 "need_more"로 하고, 사용자에게 꼭 맞는 서브태스크를 만드는 데 가장 도움이 되는 질문 '하나만' 던지세요.
   - 무엇을 물을지는 자유롭게 정하세요(예: 지금 어디까지 했는지, 무엇이 되면 끝인지, 지금 낼 수 있는 시간, 막히는 지점 등). 짧고 답하기 쉬운 질문이어야 해요.
   - 사용자가 바로 고를 수 있는 짧은 선택지(options)를 반드시 2~4개 함께 제시하세요. (options는 절대 빈 배열이면 안 됩니다.)
   - 이미 물어본 것과 [오늘의 맥락]에서 드러난 것은 다시 묻지 마세요.
   - 예외: 사용자가 "그냥 이대로 쪼개줘"처럼 바로 분해를 원하면, 즉시 남은 것을 합리적으로 가정하고 분해하세요(status: "ready").
2. 답변이 2개 쌓였다면 더 묻지 말고 반드시 분해하세요(status: "ready"). 남은 모호함은 합리적으로 가정하고 결과에 자연스럽게 반영하세요.
3. 분해할 때(status: "ready"):
   - tasks: ${maxTasks}개 이하의, 한눈에 부담 없는 작은 할 일. 각 title은 구체적인 행동으로.
   - firstStep: 지금 당장 고민 없이 할 수 있는 아주 작은 첫 행동 하나. tasks와는 별개로, 걸림돌을 우회하는 행동이어야 해요. (예: "책상에 앉기", "노트북 펼치기", "OOO 검색해보기")

# 말투
- 따뜻하고 담백한 해요체. 재촉하지 않고 부담 주지 않기. message는 질문/결과 앞에 붙는 한두 문장으로 짧게.

# 출력 형식
반드시 아래 JSON 형태 하나로만 응답하세요. JSON 외 다른 텍스트는 절대 덧붙이지 마세요.
{
  "status": "need_more" | "ready",
  "message": string,
  "question": { "text": string, "options": string[] } | null,
  "tasks": [ { "title": string } ] | null,
  "firstStep": { "title": string } | null
}
- status가 "need_more"면 question을 채우고(options 2~4개 필수) tasks와 firstStep은 null.
- status가 "ready"면 tasks(${maxTasks}개 이하)와 firstStep을 채우고 question은 null.`;

function contextBlock(goal: string, answers: Answer[]): string {
  const lines = answers.length
    ? answers
        .map((a) => `- 질문: ${a.question}\n  답변: ${a.answer}`)
        .join("\n")
    : "아직 없음";
  return `[목표]\n${goal}\n\n[지금까지 파악된 맥락]\n${lines}`;
}

function advanceUser(
  goal: string,
  answers: Answer[],
  context: string | undefined,
  maxTasks: number,
): string {
  const daily = context?.trim() ? `[오늘의 맥락]\n${context.trim()}\n\n` : "";
  // 서버가 답변 개수를 알고 있으므로 단계를 직접 조향한다 — 최소 2질문 보장.
  const steer =
    answers.length < QUESTION_MIN && !skipRequested(answers)
      ? `위 정보를 바탕으로 진행하세요. 지금까지 답변이 ${answers.length}개이므로 아직 분해하지 말고, 사용자에게 꼭 맞는 서브태스크를 만들기 위한 질문 하나를 선택지 2~4개와 함께 해주세요(status: "need_more").`
      : `필요한 답변이 모였어요. 더 묻지 말고 남은 모호함은 합리적으로 가정해 분해하세요(status: "ready").`;
  // 상한이 기본(5)보다 크다 = 다시 쪼개기 — 더 잘게 나눠달라는 신호다.
  const regen =
    maxTasks > DEFAULT_MAX_TASKS
      ? `\n\n사용자가 다시 쪼개기를 요청했어요. 이전 제안보다 단계를 더 잘게, 하나하나 부담이 덜하게 나눠주세요(최대 ${maxTasks}개).`
      : "";
  return `${daily}${contextBlock(goal, answers)}\n\n${steer}${regen}`;
}

function firstText(message: Anthropic.Message): string {
  const block = message.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text : "";
}

const asTasks = (value: unknown, maxTasks: number): Task[] =>
  (Array.isArray(value) ? value : [])
    .filter((t): t is Task => !!t && typeof t.title === "string")
    .slice(0, maxTasks);

const asStep = (value: unknown): Task =>
  value && typeof (value as Task).title === "string"
    ? { title: (value as Task).title }
    : { title: "일단 시작할 수 있는 아주 작은 행동 하나 정하기" };

async function callLLM(
  provider: Provider,
  system: string,
  user: string,
  schema: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let text: string;

  if (provider === "gpt") {
    const client = new OpenAI();
    const completion = await client.chat.completions.create({
      model: OPENAI_MODEL,
      max_tokens: 2048,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    text = completion.choices[0]?.message?.content ?? "";
  } else {
    const client = new Anthropic();
    const message = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      thinking: { type: "disabled" },
      system,
      messages: [{ role: "user", content: user }],
      output_config: { format: { type: "json_schema", schema } },
    });
    if (message.stop_reason === "refusal") {
      throw new Error(
        "요청을 처리할 수 없어요. 다른 내용으로 다시 시도해 주세요.",
      );
    }
    text = firstText(message);
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error("AI 응답을 해석하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
}

export async function POST(request: Request): Promise<Response> {
  let body: SplitRequest;
  try {
    body = (await request.json()) as SplitRequest;
  } catch {
    return Response.json(
      { error: "요청 형식이 올바르지 않아요." },
      { status: 400 },
    );
  }

  const resolved = resolveProvider(asRequestedProvider(body?.provider));
  if ("error" in resolved) {
    return Response.json({ error: resolved.error }, { status: 500 });
  }
  const provider = resolved.provider;

  if (!body?.goal?.trim()) {
    return Response.json(
      { error: "쪼갤 일을 먼저 입력해 주세요." },
      { status: 400 },
    );
  }

  const rawMax = Number(body?.maxTasks);
  const maxTasks = Number.isFinite(rawMax)
    ? Math.min(MAX_TASKS_LIMIT, Math.max(DEFAULT_MAX_TASKS, Math.floor(rawMax)))
    : DEFAULT_MAX_TASKS;

  try {
    const answers = body.answers ?? [];
    let parsed = await callLLM(
      provider,
      advanceSystem(maxTasks),
      advanceUser(body.goal, answers, body.context, maxTasks),
      ADVANCE_SCHEMA,
    );

    // 최소 2질문 보장 — 조향을 무시하고 일찍 분해하면 한 번 더 강제한다.
    if (
      parsed.status === "ready" &&
      answers.length < QUESTION_MIN &&
      !skipRequested(answers)
    ) {
      parsed = await callLLM(
        provider,
        advanceSystem(maxTasks),
        `${advanceUser(body.goal, answers, body.context, maxTasks)}\n\n(중요) 아직 질문 단계예요. 분해하지 말고 반드시 status "need_more"로 질문 하나를 선택지와 함께 해주세요.`,
        ADVANCE_SCHEMA,
      );
    }

    if (parsed.status === "ready") {
      const result: SplitResult = {
        status: "ready",
        message:
          typeof parsed.message === "string"
            ? parsed.message
            : "이렇게 쪼개봤어요.",
        tasks: asTasks(parsed.tasks, maxTasks),
        firstStep: asStep(parsed.firstStep),
      };
      return Response.json(result);
    }

    const q = parsed.question as { text?: unknown; options?: unknown } | null;
    if (!q || typeof q.text !== "string") {
      throw new Error("응답 형식이 올바르지 않아요.");
    }
    const result: SplitResult = {
      status: "need_more",
      message: typeof parsed.message === "string" ? parsed.message : "",
      question: {
        text: q.text,
        options: Array.isArray(q.options)
          ? q.options.filter((o): o is string => typeof o === "string")
          : [],
      },
    };
    return Response.json(result);
  } catch (error) {
    if (
      error instanceof Anthropic.AuthenticationError ||
      error instanceof OpenAI.AuthenticationError
    ) {
      return Response.json(
        { error: "AI API 인증에 실패했어요. API 키를 확인해 주세요." },
        { status: 500 },
      );
    }
    if (
      error instanceof Anthropic.RateLimitError ||
      error instanceof OpenAI.RateLimitError
    ) {
      return Response.json(
        { error: "요청이 잠시 몰렸어요. 잠깐 뒤에 다시 시도해 주세요." },
        { status: 429 },
      );
    }
    const message =
      error instanceof Error ? error.message : "알 수 없는 오류가 발생했어요.";
    return Response.json({ error: message }, { status: 500 });
  }
}
