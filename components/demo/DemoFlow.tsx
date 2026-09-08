"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomTabs } from "@/components/demo/BottomTabs";
import { ChatView } from "@/components/demo/ChatView";
import {
  createInitialDemoState,
  demoStateReducer,
  loadStoredDemoState,
  prepareChatRequest,
  REQUEST_TOO_LARGE_MESSAGE,
  RETRY_MESSAGE,
  saveStoredDemoState,
} from "@/components/demo/state";
import { TodayView } from "@/components/demo/TodayView";
import type { DemoRuntimeState } from "@/components/demo/types";
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Logo";
import {
  parseChatSuccessResponse,
  parseErrorResponse,
} from "@/lib/chat/contract";

/**
 * 연속 대화, 오늘 탭과 브라우저 저장을 한 클라이언트 경계에서 조율한다.
 * localStorage 복원과 UUID 발급은 서버 렌더에 없어 클라이언트 컴포넌트로 둔다.
 * 요청 원문은 분석이나 로그로 보내지 않고 공개 프록시로만 전달한다.
 */

export function DemoFlow() {
  const router = useRouter();
  const [state, dispatch] = useReducer(
    demoStateReducer,
    undefined,
    (): DemoRuntimeState => createInitialDemoState(crypto.randomUUID()),
  );
  const [draft, setDraft] = useState("");
  // 빠른 연속 입력이 reducer 재렌더 전에 같은 요청을 두 번 시작하지 않게 한다.
  const requestInFlight = useRef(false);

  // 저장소는 브라우저에서만 읽고, 첫 렌더의 새 상태로 저장본을 덮지 않게 비동기 복원한다.
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        dispatch({ type: "hydrate", stored: loadStoredDemoState() });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // reducer가 복원 완료로 표시한 스냅샷만 저장 함수가 실제 localStorage에 기록한다.
  useEffect(() => {
    saveStoredDemoState(state);
  }, [state]);

  const requestAssistant = async (
    requestState: DemoRuntimeState,
    attemptId: string,
  ) => {
    if (requestInFlight.current) return;

    const prepared = prepareChatRequest(requestState);
    if (!prepared.ok) {
      dispatch({
        type: "failRequest",
        attemptId,
        message:
          prepared.reason === "request_too_large"
            ? REQUEST_TOO_LARGE_MESSAGE
            : RETRY_MESSAGE,
      });
      return;
    }

    requestInFlight.current = true;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify(prepared.request),
      });
      const body: unknown = await response.json();

      if (response.ok) {
        const result = parseChatSuccessResponse(body, response.status);
        if (result.ok) {
          dispatch({
            type: "receiveResponse",
            id: crypto.randomUUID(),
            attemptId,
            response: result.value,
          });
          return;
        }
      } else {
        const result = parseErrorResponse(body, response.status);
        if (result.ok) {
          dispatch({
            type: "failRequest",
            attemptId,
            message: result.value.error.message,
          });
          return;
        }
      }

      dispatch({ type: "failRequest", attemptId, message: RETRY_MESSAGE });
    } catch {
      dispatch({ type: "failRequest", attemptId, message: RETRY_MESSAGE });
    } finally {
      requestInFlight.current = false;
    }
  };

  const submit = () => {
    const content = draft.trim();
    if (
      !content ||
      !state.hydrated ||
      state.request.status !== "idle" ||
      requestInFlight.current
    ) {
      return;
    }

    const attemptId = crypto.randomUUID();
    const action = {
      type: "submitUserMessage" as const,
      id: crypto.randomUUID(),
      attemptId,
      content,
    };
    const next = demoStateReducer(state, action);
    dispatch(action);
    setDraft("");
    if (next.request.status === "pending") {
      void requestAssistant(next, attemptId);
    }
  };

  const retry = () => {
    if (requestInFlight.current) return;
    const attemptId = crypto.randomUUID();
    const action = { type: "retryRequest" as const, attemptId };
    const next = demoStateReducer(state, action);
    dispatch(action);
    if (next.request.status === "pending") {
      void requestAssistant(next, attemptId);
    }
  };

  const openToday = () => dispatch({ type: "changeTab", tab: "today" });
  const openChat = () => dispatch({ type: "changeTab", tab: "chat" });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-sys-line px-4 py-3">
        <div className="flex items-center gap-2">
          <Logo size={26} />
          <span className="rounded-full bg-sys-primary-lighter px-2 py-[2px] text-[11px] font-semibold text-sys-primary-dark">
            데모
          </span>
        </div>
        <button
          type="button"
          onClick={() => router.push("/")}
          aria-label="데모 닫기"
          className="flex h-10 w-10 items-center justify-center rounded-full text-sys-label-neutral transition-colors hover:bg-sys-bg-gray hover:text-sys-label-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sys-primary-dark"
        >
          <Icon name="x" size={20} />
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden">
        {state.activeTab === "chat" ? (
          <ChatView
            state={state}
            draft={draft}
            onDraftChange={setDraft}
            onSubmit={submit}
            onRetry={retry}
            onOpenToday={openToday}
          />
        ) : (
          <TodayView state={state} dispatch={dispatch} onOpenChat={openChat} />
        )}
      </main>

      <BottomTabs
        activeTab={state.activeTab}
        todayUnread={state.todayUnread}
        onChange={(tab) => dispatch({ type: "changeTab", tab })}
      />
    </div>
  );
}
