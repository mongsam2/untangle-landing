"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Logo";
import { BraindumpPhase } from "@/components/demo/BraindumpPhase";
import { CandidatesPhase } from "@/components/demo/CandidatesPhase";
import { SplitPhase } from "@/components/demo/SplitPhase";
import { TodayPhase } from "@/components/demo/TodayPhase";
import {
  clearDemoState,
  demoReducer,
  initialDemoState,
  isResumable,
  loadDemoState,
  saveDemoState,
} from "@/components/demo/state";
import type { DemoState } from "@/components/demo/types";
import { track } from "@/lib/analytics";

/**
 * Full-flow demo orchestrator (docs/features/01-demo-shell.md).
 *
 * Owns the single reducer that drives braindump → candidates → split → today,
 * persists every transition to localStorage, and renders the shell chrome:
 * header, the exit affordance, and the resume-or-restart choice on re-entry.
 * 소감(/register)은 체험을 끝냈을 때(TodayPhase 슬라이드업)와 중간에
 * 그만뒀을 때(X 종료) 양쪽에서 이어진다.
 */

const FEEDBACK_TARGET = "/register?from=demo";

export function DemoFlow() {
  const router = useRouter();
  const [state, dispatch] = useReducer(demoReducer, initialDemoState);
  const [pendingResume, setPendingResume] = useState<DemoState | null>(null);
  const [exitSheet, setExitSheet] = useState(false);
  // Persist only after the restore decision, so the fresh initial state can't
  // clobber a saved session before the user chooses (01 §3.4).
  const [ready, setReady] = useState(false);
  const exitPromptSeen = useRef(false);

  useEffect(() => {
    const saved = loadDemoState();
    if (saved && isResumable(saved)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from persistent storage on mount
      setPendingResume(saved);
    } else {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (ready) saveDemoState(state);
  }, [ready, state]);

  // 데모 퍼널 골격 — 이어하기/처음부터 결정이 끝난(ready) 뒤의 단계 전환만 남긴다.
  // 복원 시엔 복원된 단계에서, 새로 시작하면 braindump에서 첫 이벤트가 뜬다.
  useEffect(() => {
    if (!ready) return;
    track("demo_phase_view", { phase: state.phase });
  }, [ready, state.phase]);

  // 중간에 그만둘 때도 소감으로 잇는다 — 아무 진행 없이 닫은 방문만 랜딩으로.
  const exit = () => router.push(isResumable(state) ? FEEDBACK_TARGET : "/");

  // TodayPhase의 슬라이드업 타이머 effect가 의존하는 콜백 — 렌더마다 새로
  // 만들어지면 타이머가 계속 리셋되므로 identity를 고정한다.
  const notifySlideupShown = useCallback(
    () => dispatch({ type: "slideupShown" }),
    [],
  );

  const handleClose = () => {
    // 결과물이 없으면 붙잡지 않고 즉시 종료; 결과물이 생긴 뒤에는 저장을
    // 알리는 바텀시트를 딱 한 번만 보여준다 (01 §3.5).
    if (state.cards.length === 0 || exitPromptSeen.current) {
      exit();
      return;
    }
    exitPromptSeen.current = true;
    setExitSheet(true);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header: 로고+배지 / 닫기 */}
      <header className="flex items-center justify-between border-b border-sys-line px-4 py-3">
        <div className="flex items-center gap-2">
          <Logo size={26} />
          <span className="rounded-full bg-sys-primary-lighter px-2 py-[2px] text-[11px] font-semibold text-sys-primary-dark">
            데모
          </span>
        </div>

        <button
          type="button"
          onClick={handleClose}
          aria-label="닫기"
          className="flex h-9 w-9 items-center justify-center text-sys-label-neutral transition-colors hover:text-sys-label-strong"
        >
          <Icon name="x" size={20} />
        </button>
      </header>

      {pendingResume ? (
        <ResumeChoice
          saved={pendingResume}
          onResume={() => {
            dispatch({ type: "restore", state: pendingResume });
            setPendingResume(null);
            setReady(true);
          }}
          onRestart={() => {
            clearDemoState();
            setPendingResume(null);
            setReady(true);
          }}
        />
      ) : state.phase === "braindump" ? (
        <BraindumpPhase
          initialText={state.braindump}
          onCandidates={(braindump, candidates) =>
            dispatch({ type: "candidatesReceived", braindump, candidates })
          }
        />
      ) : state.phase === "candidates" ? (
        <CandidatesPhase
          candidates={state.candidates}
          onConfirm={(selected) => {
            track("candidates_confirmed", { count: selected.length });
            dispatch({ type: "confirmTodos", selected });
          }}
          onBack={() => dispatch({ type: "backToBraindump" })}
        />
      ) : state.phase === "split" ? (
        <SplitPhase
          braindump={state.braindump}
          cards={state.cards}
          splittingCardId={state.splittingCardId}
          onPick={(cardId) => dispatch({ type: "pickSplitCard", cardId })}
          onSkip={() => dispatch({ type: "skipSplit" })}
          onLeave={() => dispatch({ type: "toToday" })}
          onConfirm={(cardId, tasks, firstStep, answers) => {
            track("split_confirmed", {
              task_count: tasks.length,
              has_first_step: !!firstStep,
            });
            dispatch({
              type: "splitConfirmed",
              cardId,
              tasks,
              firstStep,
              answers,
            });
          }}
          onResplitUsed={(cardId) => dispatch({ type: "resplitUsed", cardId })}
        />
      ) : (
        <TodayPhase
          cards={state.cards}
          slideupShown={state.slideupShown}
          onToggleFirstStep={(cardId) =>
            dispatch({ type: "toggleFirstStep", cardId })
          }
          onToggleSubtask={(cardId, subtaskId) =>
            dispatch({ type: "toggleSubtask", cardId, subtaskId })
          }
          onToggleCardDone={(cardId) =>
            dispatch({ type: "toggleCardDone", cardId })
          }
          onSplitCard={(cardId) => dispatch({ type: "startSplit", cardId })}
          onSlideupShown={notifySlideupShown}
          onRestart={() => dispatch({ type: "reset" })}
        />
      )}

      {/* 중도 종료 바텀시트 (01 §3.5) — 나가기를 막지 않는다 */}
      {exitSheet && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-sys-dark-bg/30">
          <div className="w-full max-w-[480px] rounded-t-[20px] bg-sys-bg px-6 pb-8 pt-6 shadow-[0_-10px_40px_-10px_rgba(26,26,36,0.25)]">
            <p className="text-[15.5px] font-semibold leading-[1.5] text-sys-label-strong">
              지금까지 만든 오늘 할 일은 저장해둘게요
            </p>
            <p className="pt-1 text-[13.5px] leading-[1.55] text-sys-label-neutral">
              다음에 다시 오면 이어서 할 수 있어요.
            </p>
            <div className="flex flex-col gap-2 pt-5">
              <button
                type="button"
                onClick={() => setExitSheet(false)}
                className="w-full rounded-[12px] bg-sys-primary-dark py-[13px] text-[14.5px] font-bold text-sys-on-primary"
              >
                이어서 하기
              </button>
              <button
                type="button"
                onClick={exit}
                className="w-full rounded-[12px] border border-sys-line py-[13px] text-[14.5px] font-semibold text-sys-label-neutral"
              >
                느낌 남기고 나가기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** 재진입 시 이어하기/처음부터 선택 — 딱 한 번 묻는다 (01 §3.4). */
function ResumeChoice({
  saved,
  onResume,
  onRestart,
}: {
  saved: DemoState;
  onResume: () => void;
  onRestart: () => void;
}) {
  const summary =
    saved.cards.length > 0
      ? `만들던 오늘 할 일 ${saved.cards.length}개가 있어요.`
      : "쏟아내던 이야기가 남아 있어요.";
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8">
      <p className="text-center text-[17px] font-bold leading-[1.5] text-sys-label-strong">
        이어서 할까요,
        <br />
        처음부터 할까요?
      </p>
      <p className="text-center text-[14px] text-sys-label-neutral">
        {summary}
      </p>
      <div className="flex w-full flex-col gap-2 pt-2">
        <button
          type="button"
          onClick={onResume}
          className="w-full rounded-[12px] bg-sys-primary-dark py-[14px] text-[15px] font-bold text-sys-on-primary"
        >
          이어서 하기
        </button>
        <button
          type="button"
          onClick={onRestart}
          className="w-full rounded-[12px] border border-sys-line py-[14px] text-[15px] font-semibold text-sys-label-neutral"
        >
          처음부터
        </button>
      </div>
    </div>
  );
}
