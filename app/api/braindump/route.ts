import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { Provider } from "@/components/split/types";
import type {
  BraindumpRequest,
  BraindumpResult,
  Candidate,
} from "@/components/demo/types";
import { asRequestedProvider, resolveProvider } from "@/lib/llm";

/**
 * 브레인덤프 후보 추출 backend — docs/features/02-demo-braindump.md §4.
 *
 * Single stateless action: the user's raw braindump goes in, up to 10
 * actionable to-do *candidates* come out (PRD 5.1). Deciding is the user's job
 * (원칙 3), so this never confirms anything. Inputs the model can't turn into
 * candidates come back as `retry` with concrete examples instead of a
 * counter-question (PRD 5.1 — 되묻지 않고 예시로 돕는다).
 *
 * Mirrors the /api/split conventions: provider 이중 지원(Claude 기본), 한국어
 * error mapping, client resends everything so no server session is needed.
 */

export const runtime = "nodejs";

const CLAUDE_MODEL = "claude-sonnet-5";
const OPENAI_MODEL = "gpt-4o"; // change here to use another GPT model
const MAX_CANDIDATES = 10;
const MAX_BRAINDUMP_LENGTH = 2000;

const FALLBACK_EXAMPLES = [
  "과제 2개랑 빨래가 밀렸어",
  "자소서 써야 하는데 손이 안 가",
  "시험공부 뭐부터 할지 모르겠어",
];

const BRAINDUMP_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["status", "message", "candidates", "examples"],
  properties: {
    status: { type: "string", enum: ["ok", "retry"] },
    message: { type: "string" },
    candidates: {
      anyOf: [
        { type: "null" },
        {
          type: "array",
          items: {
            // big은 더 이상 모델에게 묻지 않는다 — 화면 어디에도 쓰이지 않는데
            // "이 일이 큰가"를 판단시키면 큰 일을 쪼개고 싶어진다. 서버가 채운다.
            type: "object",
            additionalProperties: false,
            required: ["title"],
            properties: {
              title: { type: "string" },
            },
          },
        },
      ],
    },
    examples: {
      anyOf: [{ type: "null" }, { type: "array", items: { type: "string" } }],
    },
  },
};

const BRAINDUMP_SYSTEM = `당신은 "Untangle"의 Co-Planner예요. 사용자가 머릿속에 있는 일들을 정리되지 않은 채로 자유롭게 쏟아냈어요(브레인덤프).

# 가장 중요한 규칙 — 쪼개지 마세요
이 단계는 사용자가 말한 일을 찾아서 목록으로 옮겨 적는 곳이에요. 하나의 일을 여러 단계로 쪼개는 것은 다음 단계에서, 사용자가 후보를 고른 뒤에 합니다.
- 큰 일을 말했으면 후보도 하나예요. 절대로 하위 단계로 나누지 마세요.
  (예: "앱 디자인 시안 만들어야 돼" → "앱 디자인 시안 만들기" 하나. 여기서 '레퍼런스 조사하기', '컬러 팔레트 정하기', '와이어프레임 그리기' 같은 하위 단계를 만들면 안 돼요.)
- 준비물, 사전 작업, 그다음에 할 일을 추측해서 덧붙이지 마세요. 입력에 없는 일은 만들지 않습니다.

# 그 대신 빠뜨리지는 마세요
사용자가 여러 일을 말했다면 하나도 놓치지 말고 각각 후보로 만드세요. 한 문장에 섞여 있어도 나눕니다.
- (예: "과제 2개랑 빨래가 밀렸어" → 과제를 각각 하나씩 2개, 빨래 1개 = 3개)
- (예: "여자친구랑 데이트하고 초밥 먹기로 했어. 내일 팀원들과 플래닝 해야 돼." → "여자친구랑 데이트하기", "초밥 먹기", "팀원들과 플래닝하기" = 3개)
'말한 일이 여러 개라서 나누는 것'은 괜찮고, '말한 일 하나를 단계로 나누는 것'은 안 됩니다. 이 둘을 헷갈리지 마세요.

# 무엇이 후보가 되나
- 해야 하는 일뿐 아니라 하기로 한 약속, 하고 싶은 일, 노는 일도 전부 후보예요. "데이트하기", "초밥 먹기"도 어엿한 할 일입니다.
- 어미로 판단하지 마세요. "~해야 돼"든 "~기로 했어"든 "~하고 싶어"든 똑같이 후보가 됩니다.
- 감정 토로나 고민도 그냥 넘기지 말고 후보로 만드세요. 사용자가 적은 것이 화면에서 사라지면 안 돼요.
  (예: "시험 공부 뭐하지" → "시험 공부하기". 여기서 과목별로 쪼개면 안 돼요.)
  (예: "요즘 너무 지친다" → "지친 마음 돌보기"처럼 사용자가 쓴 말을 살려 한 줄로.)

# 제목 쓰는 법
- 사용자가 쓴 낱말을 그대로 쓰고 어미만 "~하기"로 다듬으세요. 자기가 적은 일임을 한눈에 알아볼 수 있어야 해요.
- 시간, 수량, 방법, 장소처럼 사용자가 말하지 않은 것을 붙이지 마세요.
  (예: "운동 다시 시작하고 싶다" → "운동 다시 시작하기". "오늘 20분 산책하기"로 바꾸면 안 돼요.)

# 후보 개수
- 개수는 목표가 아니라 결과예요. 입력에 담긴 일의 수만큼만 만드세요. 1개면 1개, 7개면 7개.
- 10개까지 담을 수 있지만, 채우려고 없는 일을 지어내지 마세요.
- 이것은 확정이 아니라 '후보 제시'예요. 고르라고 재촉하는 말은 하지 마세요.

# 후보를 만들 수 없을 때
- 인사·잡담처럼 할 일의 실마리가 전혀 없거나 뜻을 알 수 없는 입력일 때만 status를 "retry"로 하세요. 감정이나 고민이 적혀 있다면 retry가 아니라 후보를 만들어야 해요.
- retry일 때는 되묻지 말고 예시 2~3개로 도우세요. 예시는 반드시 사용자가 방금 적은 주제를 그대로 이어서, 조금 더 구체적으로 적으면 어떤 모습이 되는지 보여주세요. 주제와 상관없는 일반적인 예시를 주면 사용자는 자기 이야기가 무시당했다고 느껴요.

# 말투
- 따뜻하고 담백한 해요체. 재촉하지 않고 부담 주지 않기. message는 한두 문장으로 짧게.

# 출력 형식
반드시 아래 JSON 하나로만 응답하세요. JSON 외 다른 텍스트는 절대 덧붙이지 마세요.
{
  "status": "ok" | "retry",
  "message": string,
  "candidates": [ { "title": string } ] | null,
  "examples": string[] | null
}
- status가 "ok"면 candidates를 채우고 examples는 null.
- status가 "retry"면 examples(2~3개)를 채우고 candidates는 null.`;

function braindumpUser(braindump: string): string {
  return `[브레인덤프]\n${braindump}\n\n위 내용에 담긴 일을 후보로 옮겨 주세요. 말한 일이 여러 개면 하나도 빠뜨리지 말고 각각 나누되, 일 하나를 여러 단계로 쪼개지는 마세요 — 쪼개기는 다음 단계에서 사용자가 고른 뒤에 합니다. 제목은 위 글에 쓰인 낱말을 그대로 살려, 사용자가 자기가 적은 일임을 바로 알아볼 수 있게 써 주세요. 할 일의 실마리가 전혀 없는 입력일 때만 같은 주제를 이어가는 예시 2~3개로 도와주세요.`;
}

function firstText(message: Anthropic.Message): string {
  const block = message.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text : "";
}

/**
 * 모델 응답을 Candidate로 정규화한다. big은 더 이상 모델이 채우지 않지만
 * 저장 구조(components/demo/types.ts, state.ts의 검증)가 boolean을 요구하므로
 * 여기서 false로 메운다 — 필드를 없애면 localStorage에 남은 기존 세션이
 * 복원 시 통째로 버려진다.
 */
const asCandidates = (value: unknown): Candidate[] =>
  (Array.isArray(value) ? value : [])
    .filter(
      (c): c is { title: string; big?: unknown } =>
        !!c &&
        typeof (c as Candidate).title === "string" &&
        (c as Candidate).title.trim().length > 0,
    )
    .slice(0, MAX_CANDIDATES)
    .map((c) => ({ title: c.title.trim(), big: c.big === true }));

const asExamples = (value: unknown): string[] => {
  const list = (Array.isArray(value) ? value : []).filter(
    (e): e is string => typeof e === "string" && e.trim().length > 0,
  );
  return list.length > 0 ? list.slice(0, 3) : FALLBACK_EXAMPLES;
};

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
  let body: BraindumpRequest;
  try {
    body = (await request.json()) as BraindumpRequest;
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

  const braindump = body?.braindump?.trim();
  if (!braindump) {
    return Response.json(
      { error: "머릿속에 있는 일들을 먼저 적어 주세요." },
      { status: 400 },
    );
  }
  if (braindump.length > MAX_BRAINDUMP_LENGTH) {
    return Response.json(
      {
        error: "한 번에 담기엔 조금 길어요. 2,000자 안으로 나눠서 적어 주세요.",
      },
      { status: 400 },
    );
  }

  try {
    const parsed = await callLLM(
      provider,
      BRAINDUMP_SYSTEM,
      braindumpUser(braindump),
      BRAINDUMP_SCHEMA,
    );
    const message = typeof parsed.message === "string" ? parsed.message : "";

    if (parsed.status === "ok") {
      const candidates = asCandidates(parsed.candidates);
      // 후보가 하나도 없는 "ok"는 성립하지 않는다 — 예시 제시로 폴백 (02 §4 서버 방어)
      if (candidates.length > 0) {
        const result: BraindumpResult = {
          status: "ok",
          message: message || "오늘 할 일 후보를 뽑아봤어요.",
          candidates,
        };
        return Response.json(result);
      }
    }

    const result: BraindumpResult = {
      status: "retry",
      message:
        message || "아직 할 일 모양이 잘 안 보여요. 이런 식으로 쏟아내 볼까요?",
      examples: asExamples(parsed.examples),
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
