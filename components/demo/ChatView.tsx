"use client";

import { useEffect, useRef } from "react";
import { ChatInput } from "@/components/demo/ChatInput";
import type {
  DemoRuntimeState,
  StoredMessage,
  TaskSummary,
} from "@/components/demo/types";
import { WaitingIndicator } from "@/components/demo/WaitingIndicator";

/**
 * 저장된 대화를 시간순으로 보여주고 전송·대기·재시도를 한 흐름에 둔다.
 * 새 메시지마다 스크롤 위치를 DOM에서 읽어야 해 클라이언트 컴포넌트로 둔다.
 * 목록 응답 요약은 현재 목록과 분리해 해당 응답 시점의 값만 렌더링한다.
 */

const CHAT_INPUT_LIMIT = 4_000;
const WAITING_MESSAGES = [
  "이야기를 살펴보고 있어요.",
  "지금 필요한 질문을 고르고 있어요.",
  "조금 더 다루기 쉽게 정리하고 있어요.",
];

export function ChatView({
  state,
  draft,
  onDraftChange,
  onSubmit,
  onRetry,
  onOpenToday,
}: {
  state: DemoRuntimeState;
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  onRetry: () => void;
  onOpenToday: () => void;
}) {
  // 새 사용자 메시지는 항상, assistant 메시지는 사용자가 하단을 보고 있을 때만 따라간다.
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottom = useRef(true);

  // 새 메시지가 커밋된 뒤라야 늘어난 목록 높이를 스크롤에 반영할 수 있다.
  useEffect(() => {
    const viewport = scrollRef.current;
    const lastMessage = state.messages.at(-1);
    if (!viewport || (!isNearBottom.current && lastMessage?.role !== "user")) {
      return;
    }
    const reduceMotion = globalThis.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [state.messages, state.request.status]);

  const pending = state.request.status === "pending";
  const retry = state.request.status === "retry";
  const restoredRetry = retry && state.request.errorMessage === null;

  return (
    <section
      id="demo-panel-chat"
      role="tabpanel"
      aria-labelledby="demo-tab-chat"
      className="flex h-full min-h-0 flex-col"
    >
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        onScroll={(event) => {
          const viewport = event.currentTarget;
          isNearBottom.current =
            viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <
            80;
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5"
      >
        <div className="flex flex-col gap-3">
          {state.historyTrimmed && (
            <p className="self-center rounded-full bg-sys-bg-gray px-3 py-1.5 text-center text-[12px] leading-[1.45] text-sys-label-neutral">
              이전 대화 일부는 길이 제한으로 정리됐어요.
            </p>
          )}

          {state.messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onOpenToday={onOpenToday}
            />
          ))}

          {pending && <WaitingIndicator messages={WAITING_MESSAGES} />}

          {retry && (
            <div
              role="alert"
              className="ml-0 max-w-[88%] rounded-[14px] border border-sys-line bg-sys-bg px-4 py-3"
            >
              <p className="text-[13.5px] leading-[1.55] text-sys-label-neutral">
                {restoredRetry
                  ? "응답을 받기 전에 대화가 끝났어요."
                  : state.request.errorMessage}
              </p>
              <button
                type="button"
                onClick={onRetry}
                className="mt-2 rounded-[9px] bg-sys-primary-lighter px-3 py-2 text-[13px] font-bold text-sys-primary-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sys-primary-dark"
              >
                {restoredRetry ? "응답 다시 받기" : "다시 시도"}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-sys-line bg-sys-bg px-3 py-3">
        <ChatInput
          value={draft}
          onChange={onDraftChange}
          onSend={onSubmit}
          placeholder="편하게 적어 주세요"
          disabled={!state.hydrated || pending || retry}
          maxLength={CHAT_INPUT_LIMIT}
        />
      </div>
    </section>
  );
}

function MessageBubble({
  message,
  onOpenToday,
}: {
  message: StoredMessage;
  onOpenToday: () => void;
}) {
  const user = message.role === "user";
  return (
    <article
      aria-label={user ? "내 메시지" : "Untangle의 메시지"}
      className={`max-w-[88%] whitespace-pre-wrap break-words px-[15px] py-[11px] text-[14.5px] leading-[1.6] ${
        user
          ? "self-end rounded-[16px] rounded-tr-[5px] bg-sys-primary-dark text-sys-on-primary"
          : "self-start rounded-[16px] rounded-tl-[5px] bg-sys-bg-gray text-sys-label-strong"
      }`}
    >
      <p>{message.content}</p>
      {message.taskSummary && (
        <TaskSummaryCard
          messageId={message.id}
          summary={message.taskSummary}
          onOpenToday={onOpenToday}
        />
      )}
    </article>
  );
}

function TaskSummaryCard({
  messageId,
  summary,
  onOpenToday,
}: {
  messageId: string;
  summary: TaskSummary;
  onOpenToday: () => void;
}) {
  const remaining = summary.count - summary.titles.length;
  return (
    <div className="mt-3 rounded-[12px] border border-sys-line bg-sys-bg p-3 text-sys-label-strong">
      <p className="text-[12px] font-semibold text-sys-label-neutral">
        오늘 할 일 {summary.count}개
      </p>
      {summary.titles.length > 0 && (
        <ul className="mt-2 space-y-1.5 text-[13px] leading-[1.45]">
          {summary.titles.map((title, index) => (
            <li key={`${messageId}-${index}`} className="flex gap-2">
              <span aria-hidden="true" className="text-sys-primary-dark">
                ·
              </span>
              <span>{title}</span>
            </li>
          ))}
        </ul>
      )}
      {remaining > 0 && (
        <p className="mt-1 text-[12px] text-sys-label-neutral">
          외 {remaining}개
        </p>
      )}
      <button
        type="button"
        onClick={onOpenToday}
        className="mt-3 w-full rounded-[9px] bg-sys-primary-lighter px-3 py-2 text-[13px] font-bold text-sys-primary-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sys-primary-dark"
      >
        오늘에서 보기
      </button>
    </div>
  );
}
