import type { Answer, Task } from "@/components/split/types";
import type {
  Candidate,
  DemoCard,
  DemoState,
  DemoSubtask,
} from "@/components/demo/types";

/**
 * Demo state machine + localStorage persistence (docs/features/00-overview.md §5).
 *
 * A single reducer drives the whole flow so phase transitions are explicit and
 * the state serializes in one piece. Chat transcripts are deliberately NOT part
 * of this state — only results survive a reload (00 §5, §6 원칙 4 보존 범위).
 */

export const DEMO_STORAGE_KEY = "untangle:demo:v1";

export const initialDemoState: DemoState = {
  version: 1,
  phase: "braindump",
  braindump: "",
  candidates: [],
  cards: [],
  splittingCardId: null,
  slideupShown: false,
};

export type DemoAction =
  | { type: "restore"; state: DemoState }
  | { type: "reset" }
  /** Braindump accepted → candidates arrived (02 §5). */
  | { type: "candidatesReceived"; braindump: string; candidates: Candidate[] }
  /** "다시 쏟아내기" — back to braindump, keeping text for prefill (02 §3.2). */
  | { type: "backToBraindump" }
  /** 1~3 candidates confirmed → promoted to cards, on to the split offer. */
  | { type: "confirmTodos"; selected: Candidate[] }
  /** Split offer: picked a card / skipped straight to today (03 §3.1). */
  | { type: "pickSplitCard"; cardId: string }
  | { type: "skipSplit" }
  /** Leave the split panel without confirming ("확정 or 뒤로" — 03 §5). */
  | { type: "toToday" }
  /** Today re-entry: split an undivided card or reopen a split plan (03 §3.3). */
  | { type: "startSplit"; cardId: string }
  /** A split plan (or re-split) confirmed → attach to the card (03 §5). */
  | {
      type: "splitConfirmed";
      cardId: string;
      tasks: Task[];
      firstStep: Task;
      answers: Answer[];
    }
  /** 재생성 1회 소비 — 카드에 누적해 패널을 다시 열어도 이어지게 한다 (03 §3.3). */
  | { type: "resplitUsed"; cardId: string }
  | { type: "toggleFirstStep"; cardId: string }
  | { type: "toggleSubtask"; cardId: string; subtaskId: string }
  /** Undivided cards only — split cards complete via their subtasks (04 §3.2). */
  | { type: "toggleCardDone"; cardId: string }
  | { type: "slideupShown" };

const MAX_TODOS = 3;
// 기본 제안은 5개 이하지만, 다시 쪼개기를 거치면 최대 10개까지 제안된다.
const MAX_SUBTASKS = 10;

function promote(candidate: Candidate, index: number): DemoCard {
  return {
    id: `c${index}`,
    title: candidate.title,
    big: candidate.big,
    done: false,
    firstStep: null,
    subtasks: [],
    splitAnswers: [],
    resplitCount: 0,
  };
}

/**
 * Rebuild a card's subtasks from a confirmed plan, preserving `done` on items
 * whose title survived the re-split (03 §3.3 — 재확정 시 유지 항목의 done 보존).
 */
function buildSubtasks(
  cardId: string,
  tasks: Task[],
  previous: DemoSubtask[],
): DemoSubtask[] {
  const remaining = [...previous];
  return tasks.slice(0, MAX_SUBTASKS).map((task, i) => {
    const keptIndex = remaining.findIndex((s) => s.title === task.title);
    const kept = keptIndex >= 0 ? remaining.splice(keptIndex, 1)[0] : null;
    return {
      id: `${cardId}-${i}`,
      title: task.title,
      done: kept?.done ?? false,
    };
  });
}

function updateCard(
  state: DemoState,
  cardId: string,
  update: (card: DemoCard) => DemoCard,
): DemoState {
  return {
    ...state,
    cards: state.cards.map((c) => (c.id === cardId ? update(c) : c)),
  };
}

/**
 * 저장 상태를 이어하기로 되살릴 때의 정규화.
 * - 쪼개기는 고르기 화면부터 재개한다 (03 §6) — 진행 중이던 clarify 문답은
 *   의도적으로 유실을 허용하며, 패널로 직행하면 사용자 행동 없이 advance
 *   호출이 나가므로 splittingCardId를 비운다.
 * - 카드 없이 split/today에 도달한 손상 상태는 뒤로 되돌린다 (04 §5).
 * - resplitCount가 없던 시절의 저장 상태는 0으로 채운다. 버전을 올려 통째로
 *   버리면 진행 중이던 방문자의 "이어서 하기"가 사라지므로 채워서 살린다.
 */
function normalizeRestored(state: DemoState): DemoState {
  const next: DemoState = {
    ...state,
    splittingCardId: null,
    cards: state.cards.map((card) => ({
      ...card,
      resplitCount:
        typeof card.resplitCount === "number" && card.resplitCount >= 0
          ? card.resplitCount
          : 0,
    })),
  };
  if (
    (next.phase === "split" || next.phase === "today") &&
    next.cards.length === 0
  ) {
    next.phase = next.candidates.length > 0 ? "candidates" : "braindump";
  }
  return next;
}

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case "restore":
      return normalizeRestored(action.state);
    case "reset":
      return initialDemoState;
    case "candidatesReceived":
      return {
        ...state,
        phase: "candidates",
        braindump: action.braindump,
        candidates: action.candidates,
      };
    case "backToBraindump":
      return { ...state, phase: "braindump" };
    case "confirmTodos": {
      const cards = action.selected.slice(0, MAX_TODOS).map(promote);
      if (cards.length === 0) return state;
      return { ...state, phase: "split", cards, splittingCardId: null };
    }
    case "pickSplitCard":
      return { ...state, phase: "split", splittingCardId: action.cardId };
    case "skipSplit":
    case "toToday":
      return { ...state, phase: "today", splittingCardId: null };
    case "startSplit":
      return { ...state, phase: "split", splittingCardId: action.cardId };
    case "splitConfirmed": {
      const next = updateCard(state, action.cardId, (card) => ({
        ...card,
        done: false,
        subtasks: buildSubtasks(action.cardId, action.tasks, card.subtasks),
        firstStep: {
          title: action.firstStep.title,
          done:
            card.firstStep?.title === action.firstStep.title
              ? card.firstStep.done
              : false,
        },
        splitAnswers: action.answers,
      }));
      return { ...next, phase: "today", splittingCardId: null };
    }
    case "resplitUsed":
      // 상한 자체는 useSplitFlow가 지킨다 — 여기서는 사용량만 누적한다.
      return updateCard(state, action.cardId, (card) => ({
        ...card,
        resplitCount: card.resplitCount + 1,
      }));
    case "toggleFirstStep":
      return updateCard(state, action.cardId, (card) =>
        card.firstStep
          ? {
              ...card,
              firstStep: { ...card.firstStep, done: !card.firstStep.done },
            }
          : card,
      );
    case "toggleSubtask":
      return updateCard(state, action.cardId, (card) => ({
        ...card,
        subtasks: card.subtasks.map((s) =>
          s.id === action.subtaskId ? { ...s, done: !s.done } : s,
        ),
      }));
    case "toggleCardDone":
      return updateCard(state, action.cardId, (card) =>
        card.subtasks.length > 0 ? card : { ...card, done: !card.done },
      );
    case "slideupShown":
      return { ...state, slideupShown: true };
  }
}

/** 쪼갠 카드 = 서브태스크 전부 done / 미분해 카드 = 카드 체크 (04 §4). */
export function isCardDone(card: DemoCard): boolean {
  if (card.subtasks.length > 0) return card.subtasks.every((s) => s.done);
  return card.done;
}

/** Any check anywhere — the demo's success signal and slide-up trigger (04 §3.4). */
export function hasAnyCheck(state: DemoState): boolean {
  return state.cards.some(
    (c) => c.done || c.firstStep?.done || c.subtasks.some((s) => s.done),
  );
}

/** Worth offering "이어서 하기"? (01 §3.4 — braindump 원문 이상 진행) */
export function isResumable(state: DemoState): boolean {
  return (
    state.phase !== "braindump" ||
    state.braindump.trim().length > 0 ||
    state.candidates.length > 0
  );
}

function isValidCandidate(value: unknown): value is Candidate {
  if (!value || typeof value !== "object") return false;
  const c = value as Candidate;
  return typeof c.title === "string" && typeof c.big === "boolean";
}

function isValidSubtask(value: unknown): value is DemoSubtask {
  if (!value || typeof value !== "object") return false;
  const s = value as DemoSubtask;
  return (
    typeof s.id === "string" &&
    typeof s.title === "string" &&
    typeof s.done === "boolean"
  );
}

function isValidCard(value: unknown): value is DemoCard {
  if (!value || typeof value !== "object") return false;
  const c = value as DemoCard;
  return (
    typeof c.id === "string" &&
    typeof c.title === "string" &&
    typeof c.big === "boolean" &&
    typeof c.done === "boolean" &&
    (c.firstStep === null ||
      (!!c.firstStep &&
        typeof c.firstStep.title === "string" &&
        typeof c.firstStep.done === "boolean")) &&
    Array.isArray(c.subtasks) &&
    c.subtasks.every(isValidSubtask) &&
    // 쪼갠 카드에 firstStep이 없는 상태는 성립하지 않는다 (00 §5).
    (c.subtasks.length === 0 || c.firstStep !== null) &&
    Array.isArray(c.splitAnswers) &&
    // 이 필드가 생기기 전의 저장 상태도 받아준다 — normalizeRestored가 0으로 채운다.
    (c.resplitCount === undefined || typeof c.resplitCount === "number")
  );
}

function isValidDemoState(value: unknown): value is DemoState {
  if (!value || typeof value !== "object") return false;
  const s = value as DemoState;
  return (
    s.version === 1 &&
    ["braindump", "candidates", "split", "today"].includes(s.phase) &&
    typeof s.braindump === "string" &&
    Array.isArray(s.candidates) &&
    s.candidates.every(isValidCandidate) &&
    Array.isArray(s.cards) &&
    s.cards.every(isValidCard) &&
    (s.splittingCardId === null || typeof s.splittingCardId === "string") &&
    typeof s.slideupShown === "boolean"
  );
}

/** Returns null on missing, invalid, or version-mismatched state (01 §5). */
export function loadDemoState(): DemoState | null {
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidDemoState(parsed) ? parsed : null;
  } catch {
    return null; // storage blocked or corrupted — the demo still works (01 §5)
  }
}

export function saveDemoState(state: DemoState): void {
  try {
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage errors (private mode, quota) — 저장 없이 진행
  }
}

export function clearDemoState(): void {
  try {
    localStorage.removeItem(DEMO_STORAGE_KEY);
  } catch {
    // ignore
  }
}
