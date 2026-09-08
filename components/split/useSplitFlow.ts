"use client";

import { useEffect, useRef, useState } from "react";
import type {
  Answer,
  Provider,
  Question,
  SplitRequest,
  SplitResponse,
  Task,
} from "@/components/split/types";

/**
 * Co-Planner 쪼개기 대화 로직 — extracted from the old inline SplitChat so the
 * demo can drive it with an injected goal (docs/features/03-demo-split.md §4).
 *
 * Differences from the old component: no intro phase (the goal is the card
 * title), `context` (브레인덤프 원문) rides along on every advance. 질문은
 * 항상 2개를 받은 뒤 분해한다(서버가 보장, "그냥 이대로 쪼개줘" 스킵만 예외)
 * — 상한도 2개로 클라이언트가 지킨다:
 *  - soft guard: the 2nd answer is sent with an "assume the rest" suffix;
 *  - hard guard: a `need_more` after 2 answers is never shown — one silent
 *    skip-advance is retried, then an error banner. A 3rd question cannot
 *    reach the screen (03 §3.2).
 *
 * The caller must keep `goal`/`initialAnswers`/`initialResult`/`context`
 * stable for the hook's lifetime — remount (e.g. key by card id) to change them.
 */

export const SKIP_ANSWER = "그냥 이대로 쪼개줘";
const SOFT_GUARD_SUFFIX = " (남은 건 알아서 가정하고 이대로 쪼개주세요)";
const IMMEDIATE_ACK = "좋아요. 몇 가지만 짧게 여쭤볼게요.";
const REOPEN_NOTE =
  "저장해둔 계획이에요. 마음에 들지 않으면 다시 쪼갤 수 있어요.";
/** 무엇이 달라지는지 먼저 말해준다 — 결과만 바뀌면 "뭘 다시 쪼갠 거지?"가 된다. */
const regenNote = (cap: number) =>
  `다시 쪼개볼게요. 이번에는 최대 ${cap}단계까지 나눠서 제안해 볼게요.`;
/** 상한이 이미 최대일 때 — 더 잘게 나눠주겠다고 약속하지 않는다. */
const REGEN_SAME_NOTE = "다시 쪼개볼게요. 같은 조건으로 새로 제안해 볼게요.";
const NETWORK_ERROR = "연결에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.";
const HARD_GUARD_ERROR =
  "질문이 길어지지 않게 여기서 바로 쪼개볼게요. 다시 시도를 눌러 주세요.";

const QUESTION_CAP = 2;
/** 서브태스크 상한 — 다시 쪼개기를 거듭할수록 더 잘게 제안한다 (5 → 8 → 10). */
const TASK_CAPS = [5, 8, 10] as const;
/**
 * 한 할 일에 쓸 수 있는 "다시 쪼개기" 횟수. 재생성 1회 = LLM 호출 1회이므로
 * 카드마다 여기서 끊는다. 카운트는 카드에 저장되어 패널을 드나들어도 이어진다.
 */
export const MAX_RESPLITS = 3;

export type FlowTask = { id: string; title: string; done: boolean };
export type FlowLogItem = { id: number; role: "user" | "ai"; text: string };

export type UseSplitFlowArgs = {
  /** 미지정이면 서버가 결정한다 — LLM_PROVIDER 환경 변수 또는 키가 있는 쪽. */
  provider?: Provider;
  /** 카드 title이 주입된다 — 목표 입력(intro) 단계는 없다. */
  goal: string;
  /** 다시 쪼개기: 이전 clarify 문답에 이어간다 (원칙 4). */
  initialAnswers?: Answer[];
  /**
   * 쪼갠 카드 재진입: 저장된 계획으로 result 화면을 재구성한다. 서브태스크는
   * 더 쪼갤 수 없고, 마음에 들지 않으면 regenerate()로 전체를 다시 만든다 —
   * 새 결과는 확정해야 카드에 반영된다 (03 §3.3).
   */
  initialResult?: {
    tasks: { title: string; done: boolean }[];
    firstStep: Task;
  } | null;
  /** 브레인덤프 원문 — 데모는 항상 전달 (03 §4 필수 확장). */
  context?: string;
  /**
   * 카드에 저장된 "다시 쪼개기" 사용 횟수. 이걸로 seed해야 패널을 다시 열어도
   * 남은 횟수와 상한 사다리(5 → 8 → 10)가 이어진다.
   */
  initialResplitCount?: number;
  /** 재생성 1회를 소비했다 — 카드에 저장하라는 신호. */
  onResplit?: () => void;
  onConfirm: (result: {
    tasks: Task[];
    firstStep: Task;
    answers: Answer[];
  }) => void;
};

async function postSplit(body: SplitRequest): Promise<SplitResponse> {
  const res = await fetch("/api/split", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as SplitResponse;
}

export function useSplitFlow({
  provider,
  goal,
  initialAnswers,
  initialResult,
  context,
  initialResplitCount,
  onResplit,
  onConfirm,
}: UseSplitFlowArgs) {
  const reopening = !!initialResult;

  const [phase, setPhase] = useState<"clarify" | "result">(
    reopening ? "result" : "clarify",
  );
  const [log, setLog] = useState<FlowLogItem[]>([
    { id: 0, role: "ai", text: reopening ? REOPEN_NOTE : IMMEDIATE_ACK },
  ]);
  const [pending, setPending] = useState<Question | null>(null);
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState<FlowTask[]>(() =>
    (initialResult?.tasks ?? []).map((t, i) => ({
      id: `t${i}`,
      title: t.title,
      done: t.done,
    })),
  );
  const [firstStep, setFirstStep] = useState<Task | null>(
    initialResult ? { title: initialResult.firstStep.title } : null,
  );
  const [selected, setSelected] = useState<Record<string, boolean>>(() => {
    const all: Record<string, boolean> = {};
    (initialResult?.tasks ?? []).forEach((_, i) => (all[`t${i}`] = true));
    return all;
  });
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState<(() => void) | null>(null);
  /** 다시 쪼개기 직전의 계획 — 새 제안과 무엇이 달라졌는지 대조할 수 있게. */
  const [previousTasks, setPreviousTasks] = useState<string[] | null>(null);

  const answersRef = useRef<Answer[]>(initialAnswers ?? []);
  const taskCounter = useRef(tasks.length);
  const logCounter = useRef(1);
  const autoSkipUsed = useRef(false);
  const started = useRef(false);
  // 다시 쪼개기 횟수 — 상한을 5 → 8 → 10으로 올리고, MAX_RESPLITS에서 끊는다.
  // ref가 진실의 원천인 이유: runAdvance가 비동기로 maxTasks()를 읽으므로 state만
  // 두면 같은 틱에서 스테일한 상한이 실려 나간다. 렌더용으로 state를 함께 민다.
  const regenCount = useRef(initialResplitCount ?? 0);
  const [resplitsUsed, setResplitsUsed] = useState(initialResplitCount ?? 0);
  // 재생성이 성공해 새 결과가 도착했을 때만 커밋할 직전 계획.
  const pendingPrevious = useRef<string[] | null>(null);
  const maxTasks = () =>
    TASK_CAPS[Math.min(regenCount.current, TASK_CAPS.length - 1)];

  const appendAi = (text: string) => {
    if (!text?.trim()) return;
    setLog((prev) => [...prev, { id: logCounter.current++, role: "ai", text }]);
  };
  const appendUser = (text: string) =>
    setLog((prev) => [
      ...prev,
      { id: logCounter.current++, role: "user", text },
    ]);

  const makeTasks = (list: Task[], done = false): FlowTask[] =>
    list
      .slice(0, maxTasks())
      .map((t) => ({ id: `t${taskCounter.current++}`, title: t.title, done }));

  function showResult(taskList: Task[], step: Task) {
    const flow = makeTasks(taskList);
    setTasks(flow);
    setFirstStep({ title: step.title });
    const all: Record<string, boolean> = {};
    flow.forEach((t) => (all[t.id] = true));
    setSelected(all);
    setPhase("result");
    // 다시 쪼개기로 도착한 결과일 때만 직전 계획을 비교용으로 남긴다. 요청이
    // 실패했다면 화면의 계획이 그대로이므로 여기까지 오지 않는다.
    if (pendingPrevious.current) {
      setPreviousTasks(pendingPrevious.current);
      pendingPrevious.current = null;
    }
  }

  async function runAdvance(answers: Answer[]) {
    setLoading(true);
    setError(null);
    setRetry(null);
    try {
      const data = await postSplit({
        action: "advance",
        provider,
        goal,
        answers,
        context,
        maxTasks: maxTasks(),
      });
      if ("error" in data) {
        setError(data.error);
        setRetry(() => () => runAdvance(answers));
        return;
      }
      if (data.status === "ready") {
        appendAi(data.message);
        showResult(data.tasks, data.firstStep);
        return;
      }
      if (data.status !== "need_more") return;

      if (answers.length >= QUESTION_CAP) {
        // 하드 가드: 상한을 넘는 질문은 화면에 올리지 않는다 (03 §3.2-3).
        if (!autoSkipUsed.current) {
          autoSkipUsed.current = true;
          const skipAnswers = [
            ...answers,
            { question: data.question.text, answer: SKIP_ANSWER },
          ];
          answersRef.current = skipAnswers;
          // await로 이어야 바깥 finally가 자동 스킵 요청 중에 loading을 끄지 않는다.
          await runAdvance(skipAnswers);
        } else {
          // 같은 자동 스킵 호출을 그대로 재실행한다 — 재시도마다 합성 문답을
          // 더 쌓지 않는다 (03 §6).
          setError(HARD_GUARD_ERROR);
          setRetry(() => () => runAdvance(answers));
        }
        return;
      }

      appendAi(data.message);
      appendAi(data.question.text);
      setPending(data.question);
    } catch {
      setError(NETWORK_ERROR);
      setRetry(() => () => runAdvance(answers));
    } finally {
      setLoading(false);
    }
  }

  // Kick off the first advance right after the card is picked (03 §3.1) — the
  // seeded IMMEDIATE_ACK line is already on screen, so the wait is announced.
  useEffect(() => {
    if (reopening || started.current) return;
    started.current = true;
    void runAdvance(answersRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run-once kickoff; args are stable per mount (see contract above)
  }, []);

  function answerPending(text: string) {
    const answer = text.trim();
    if (!pending || loading || !answer) return;
    const question = pending;
    appendUser(answer);
    setPending(null);
    // 소프트 가드: 마지막(2번째) 답변에는 "남은 건 가정" 문구를 실어 보낸다 (03 §3.2-2).
    const isLast = answersRef.current.length >= QUESTION_CAP - 1;
    const sent =
      isLast && answer !== SKIP_ANSWER
        ? `${answer}${SOFT_GUARD_SUFFIX}`
        : answer;
    const next = [
      ...answersRef.current,
      { question: question.text, answer: sent },
    ];
    answersRef.current = next;
    void runAdvance(next);
  }

  /**
   * "다시 쪼개기" — 전체 계획을 같은 문답·맥락으로 재생성한다 (PRD 5.2).
   * 요청할 때마다 상한이 5 → 8 → 10으로 올라 더 잘게 제안된다.
   * 화면의 제안만 바뀌며, 카드에는 confirm()해야 반영된다.
   *
   * 횟수는 클릭 시점에 센다 — 실패한 재생성도 LLM을 한 번 태우기 때문이다.
   * 대신 에러 배너의 "다시 시도"(retryNow)는 regenerate를 거치지 않으므로 공짜다.
   */
  function regenerate() {
    if (loading || regenCount.current >= MAX_RESPLITS) return;
    if (tasks.length > 0) pendingPrevious.current = tasks.map((t) => t.title);
    const capBefore = maxTasks();
    // 클램프하지 않는다 — 이 값은 "사용 횟수"이고, 상한 사다리는 maxTasks()가
    // TASK_CAPS 길이로 따로 클램프한다. 여기서 묶으면 3회를 셀 수 없다.
    regenCount.current += 1;
    setResplitsUsed(regenCount.current);
    onResplit?.();
    autoSkipUsed.current = false; // 재생성마다 하드 가드 자동 스킵 기회를 새로 준다
    const cap = maxTasks();
    appendAi(cap === capBefore ? REGEN_SAME_NOTE : regenNote(cap));
    void runAdvance(answersRef.current);
  }

  const toggleSelected = (taskId: string) =>
    setSelected((prev) => ({ ...prev, [taskId]: !prev[taskId] }));

  const selectedCount = tasks.filter((t) => selected[t.id]).length;

  function confirm() {
    if (!firstStep || selectedCount === 0 || loading) return;
    onConfirm({
      tasks: tasks
        .filter((t) => selected[t.id])
        .map((t) => ({ title: t.title })),
      firstStep,
      answers: answersRef.current,
    });
  }

  function retryNow() {
    if (!retry) return;
    const run = retry;
    setError(null);
    setRetry(null);
    run();
  }

  return {
    phase,
    log,
    pending,
    loading,
    tasks,
    previousTasks,
    firstStep,
    selected,
    selectedCount,
    error,
    canRetry: retry !== null,
    /** 아직 "다시 쪼개기"가 남았는가 — 소진하면 버튼 자체를 내린다. */
    canResplit: resplitsUsed < MAX_RESPLITS,
    answerPending,
    regenerate,
    toggleSelected,
    confirm,
    retryNow,
  };
}
