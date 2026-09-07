"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { ChatInput } from "@/components/demo/ChatInput";
import { WaitingIndicator } from "@/components/demo/WaitingIndicator";
import type { DemoCard } from "@/components/demo/types";
import { ChatBubble } from "@/components/split/ChatBubble";
import { OptionChips } from "@/components/split/OptionChips";
import type { Answer, Task } from "@/components/split/types";
import {
  MAX_RESPLITS,
  SKIP_ANSWER,
  useSplitFlow,
} from "@/components/split/useSplitFlow";

/**
 * Split phase screens (docs/features/03-demo-split.md).
 *
 * `splittingCardId === null` → pick-a-card screen (§3.1): one question and the
 * confirmed cards as chips + a skip chip. AI가 카드를 대신 고르거나 추천하지
 * 않는다 (원칙 3).
 * Otherwise → DemoSplitPanel keyed by card id so switching cards remounts the
 * flow. Clarify/result are driven by useSplitFlow; the result's include pills
 * deliberately look nothing like Today's done checkboxes (§3.2 — "내 선택이
 * 날아갔다" 오독 방지). 서브태스크는 더 쪼갤 수 없다 — 마음에 들지 않으면
 * "다시 쪼개기"로 전체를 재생성하고, 확정해야 카드에 반영된다.
 */

// "가장 막막한 일" 같은 표현은 처음 읽는 사람에게 무슨 뜻인지 전해지지 않는다.
// 무엇을 고르는지와 고르면 무엇이 일어나는지를 그대로 쓴다.
const PICK_QUESTION =
  "어떤 일부터 시작해볼까요? 하나 고르면 지금 바로 할 수 있는 작은 단계로 쪼개드릴게요.";
const SKIP_CHIP = "괜찮아요, 바로 시작할게요";
const LEAVE_LABEL = "지금은 넘어가기";
const CONFIRM_LABEL = "이 계획으로 시작";
const REGEN_LABEL = "다시 쪼개기";
// 버튼이 사라진 이유를 딱 한 번 말해준다 — 말없이 없어지면 고장으로 읽힌다.
const REGEN_EXHAUSTED = `다시 쪼개기는 할 일 하나당 ${MAX_RESPLITS}번까지예요`;
const ANSWER_PLACEHOLDER = "직접 답을 적어도 돼요";
const WAIT_MESSAGES = [
  "이 일을 찬찬히 살펴보는 중…",
  "작은 단계로 나누는 중…",
  "거의 다 됐어요",
];

export function SplitPhase({
  braindump,
  cards,
  splittingCardId,
  onPick,
  onSkip,
  onLeave,
  onConfirm,
  onResplitUsed,
}: {
  /** 쪼개기 advance의 context로 항상 전달 (03 §4 필수 확장). */
  braindump: string;
  cards: DemoCard[];
  /** null = 쪼갤 카드 고르기 화면. */
  splittingCardId: string | null;
  onPick: (cardId: string) => void;
  onSkip: () => void;
  /** 패널의 "지금은 넘어가기" — 확정 없이 Today로. */
  onLeave: () => void;
  onConfirm: (
    cardId: string,
    tasks: Task[],
    firstStep: Task,
    answers: Answer[],
  ) => void;
  /** 재생성 1회 소비 — 확정과 무관하게 즉시 카드에 누적한다. */
  onResplitUsed: (cardId: string) => void;
}) {
  const card = splittingCardId
    ? (cards.find((c) => c.id === splittingCardId) ?? null)
    : null;

  if (!card) {
    return <SplitPicker cards={cards} onPick={onPick} onSkip={onSkip} />;
  }

  return (
    <DemoSplitPanel
      key={card.id}
      braindump={braindump}
      card={card}
      onLeave={onLeave}
      onResplitUsed={() => onResplitUsed(card.id)}
      onConfirm={(result) =>
        onConfirm(card.id, result.tasks, result.firstStep, result.answers)
      }
    />
  );
}

/** 쪼갤 카드 고르기 (03 §3.1). */
function SplitPicker({
  cards,
  onPick,
  onSkip,
}: {
  cards: DemoCard[];
  onPick: (cardId: string) => void;
  onSkip: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="flex flex-col gap-3">
          <ChatBubble role="ai">{PICK_QUESTION}</ChatBubble>

          <div className="flex flex-col gap-[7px] pt-0.5">
            {cards.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onPick(c.id)}
                className="flex items-center gap-2 rounded-[12px] border border-sys-line-strong bg-sys-bg-gray px-4 py-[13px] text-left text-[14.5px] leading-[1.4] text-sys-label-strong transition-colors hover:border-sys-primary hover:bg-sys-primary-lighter"
              >
                <span className="min-w-0 flex-1">{c.title}</span>
                {/* 이미 쪼갠 카드는 저장된 계획을 다시 여는 동선 (03 §3.3) */}
                {c.subtasks.length > 0 && (
                  <span className="shrink-0 rounded-full bg-sys-primary-lighter px-2 py-[2px] text-[11px] font-semibold text-sys-primary-dark">
                    다시 열기
                  </span>
                )}
              </button>
            ))}
            <button
              type="button"
              onClick={onSkip}
              className="rounded-[12px] border border-sys-line-strong bg-sys-bg-gray px-4 py-[13px] text-left text-[14.5px] leading-[1.4] text-sys-label-neutral transition-colors hover:border-sys-primary hover:bg-sys-primary-lighter"
            >
              {SKIP_CHIP}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** clarify → result 쪼개기 패널 (03 §3.2) — 카드 전환 시 key로 리마운트된다. */
function DemoSplitPanel({
  braindump,
  card,
  onLeave,
  onConfirm,
  onResplitUsed,
}: {
  braindump: string;
  card: DemoCard;
  onLeave: () => void;
  onConfirm: (result: {
    tasks: Task[];
    firstStep: Task;
    answers: Answer[];
  }) => void;
  onResplitUsed: () => void;
}) {
  const flow = useSplitFlow({
    goal: card.title,
    initialAnswers: card.splitAnswers,
    // 카드에 누적된 사용 횟수로 seed — 패널을 다시 열어도 남은 횟수가 이어진다.
    initialResplitCount: card.resplitCount,
    onResplit: onResplitUsed,
    // 쪼갠 카드 재진입: 저장된 계획으로 result를 재구성, advance는 안 돈다 (03 §3.3).
    initialResult:
      card.subtasks.length > 0
        ? {
            tasks: card.subtasks.map((s) => ({ title: s.title, done: s.done })),
            firstStep: { title: card.firstStep!.title },
          }
        : null,
    context: braindump,
    onConfirm,
  });
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const waiting = flow.loading;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [flow.log, flow.pending, flow.loading, flow.phase, flow.error]);

  const sendAnswer = () => {
    const text = input.trim();
    if (!text || !flow.pending || flow.loading) return;
    setInput("");
    flow.answerPending(text);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 어떤 카드를 쪼개는 중인지 잃지 않게 (원칙 4) */}
      <div className="flex items-center gap-1.5 border-b border-sys-line px-5 py-[9px]">
        <Icon
          name="scissors"
          size={13}
          strokeWidth={2}
          className="shrink-0 text-sys-primary-dark"
        />
        <span className="truncate text-[12.5px] font-semibold text-sys-label-neutral">
          {card.title}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="flex flex-col gap-3">
          {flow.log.map((item) => (
            <ChatBubble key={item.id} role={item.role}>
              {item.text}
            </ChatBubble>
          ))}

          {/* 매 질문에 스킵 칩 상시 노출 (03 §3.2) */}
          {flow.pending && !flow.loading && (
            <div className="pt-0.5">
              <OptionChips
                options={[...flow.pending.options, SKIP_ANSWER]}
                onPick={flow.answerPending}
                disabled={flow.loading}
              />
            </div>
          )}

          {flow.phase === "result" && flow.firstStep && (
            <div className="flex flex-col gap-[9px] pt-1">
              {/* 지금 할 첫 단계 — 체크박스 없음, 항상 카드에 붙는다 (03 §3.2) */}
              <div className="rounded-[14px] bg-sys-primary-lighter px-[14px] py-[13px]">
                <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-bold tracking-[0.4px] text-sys-primary-dark">
                  <Icon name="sparkles" size={13} strokeWidth={2} />
                  지금 할 첫 단계
                </div>
                <span className="text-[14.5px] font-medium leading-[1.45] text-sys-label-strong">
                  {flow.firstStep.title}
                </span>
              </div>

              {/* 서브태스크는 더 쪼갤 수 없다 — 항목별 쪼개기 버튼 없음 */}
              {flow.tasks.map((task) => {
                const included = !!flow.selected[task.id];
                return (
                  <div
                    key={task.id}
                    className={`flex items-center gap-2.5 rounded-[14px] border bg-sys-bg px-[14px] py-[11px] transition-colors ${
                      included
                        ? "border-sys-primary-light"
                        : "border-sys-line-strong"
                    }`}
                  >
                    {/* 담기 토글 — Today의 완료 체크박스와 다른 형태 (03 §3.2) */}
                    <button
                      type="button"
                      onClick={() => flow.toggleSelected(task.id)}
                      aria-pressed={included}
                      aria-label={`계획에 담기: ${task.title}`}
                      className={`flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-[5px] text-[11.5px] transition-colors ${
                        included
                          ? "border-sys-primary-dark bg-sys-primary-dark font-bold text-sys-on-primary"
                          : "border-sys-line bg-sys-bg font-semibold text-sys-label-neutral"
                      }`}
                    >
                      {included && (
                        <Icon name="check" size={11} strokeWidth={3} />
                      )}
                      {included ? "담김" : "담기"}
                    </button>

                    <span
                      className={`min-w-0 flex-1 text-[14px] leading-[1.45] ${
                        task.done
                          ? "text-sys-label-alt line-through"
                          : "text-sys-label-strong"
                      }`}
                    >
                      {task.title}
                    </span>
                  </div>
                );
              })}

              {/* 다시 쪼개기를 하면 이전 목록이 사라져 무엇이 달라졌는지 확인할
                  수 없었다 — 직전 계획을 접어둔 채로 함께 남긴다. */}
              {flow.previousTasks && flow.previousTasks.length > 0 && (
                // key로 갈아끼워 다시 접는다 — 펼친 채로 내용만 바뀌면 어느 쪽이
                // 방금 만든 계획인지 구분되지 않는다.
                <PreviousPlan
                  key={flow.previousTasks.join("|")}
                  titles={flow.previousTasks}
                />
              )}
            </div>
          )}

          {/* 공통 대기 연출 — advance·resplit 모두 (03 §3.2, 05 §4.2) */}
          {waiting && <WaitingIndicator messages={WAIT_MESSAGES} />}

          {flow.error && (
            <div className="rounded-[12px] border border-sys-pri-high/30 bg-sys-pri-high-bg px-[14px] py-2.5 text-[13px] leading-[1.5] text-sys-pri-high">
              {flow.error}
              {flow.canRetry && (
                <button
                  type="button"
                  onClick={flow.retryNow}
                  className="ml-2 font-bold underline"
                >
                  다시 시도
                </button>
              )}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {flow.phase === "result" ? (
        <div className="flex flex-col gap-2 border-t border-sys-line px-4 py-3">
          <span className="px-1 text-[12.5px] font-semibold text-sys-label-neutral">
            {flow.selectedCount}개 선택됨
          </span>
          <button
            type="button"
            onClick={flow.confirm}
            disabled={flow.selectedCount === 0 || waiting}
            className="w-full rounded-[12px] bg-sys-primary-dark py-[13px] text-[14.5px] font-bold text-sys-on-primary transition-opacity disabled:opacity-40"
          >
            {CONFIRM_LABEL}
          </button>
          <div className="flex items-center justify-center gap-6">
            {/* 마음에 들지 않으면 전체를 다시 만든다 — 확정 전에는 카드 미반영.
                남은 횟수는 평소에 세어 보여주지 않는다: 카운트다운·"N개 남음" 류
                압박 카피 금지 (00 §6). 다 쓴 뒤에만 조용히 알린다. */}
            {flow.canResplit ? (
              <button
                type="button"
                onClick={flow.regenerate}
                disabled={waiting}
                className="flex items-center gap-1.5 px-2 py-1 text-[12.5px] font-semibold text-sys-label-neutral transition-colors hover:text-sys-primary-dark disabled:opacity-50"
              >
                <Icon name="scissors" size={13} strokeWidth={2} />
                {REGEN_LABEL}
              </button>
            ) : (
              <span className="px-2 py-1 text-[12.5px] text-sys-label-alt">
                {REGEN_EXHAUSTED}
              </span>
            )}
            <LeaveButton onLeave={onLeave} disabled={waiting} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 border-t border-sys-line px-4 py-3">
          <ChatInput
            value={input}
            onChange={setInput}
            onSend={sendAnswer}
            placeholder={ANSWER_PLACEHOLDER}
            disabled={!flow.pending || flow.loading}
          />
          <LeaveButton onLeave={onLeave} disabled={waiting} />
        </div>
      )}
    </div>
  );
}

/** 다시 쪼개기 직전 계획 — 기본은 접어두고, 눌러야 펼친다 (새 제안이 주인공). */
function PreviousPlan({ titles }: { titles: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-[12px] border border-sys-line-strong bg-sys-bg-gray px-[14px] py-2.5">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="w-full text-left text-[12.5px] font-semibold text-sys-label-neutral transition-colors hover:text-sys-label-strong"
      >
        {open ? "이전 계획 접기" : `이전 계획 보기 (${titles.length}개)`}
      </button>
      {open && (
        <ul className="flex flex-col gap-1 pt-2">
          {titles.map((title, i) => (
            <li
              key={`${i}-${title}`}
              // 대조하라고 펼치는 목록이므로 본문 대비를 지킨다 — label-alt는
              // 회색 배경 위에서 2:1 수준이라 읽히지 않는다.
              className="text-[13px] leading-[1.45] text-sys-label-neutral"
            >
              {title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 하단 보조 동선 — 확정 없이 Today로 (03 §5 "확정 or 뒤로"). */
function LeaveButton({
  onLeave,
  disabled,
}: {
  onLeave: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onLeave}
      disabled={disabled}
      className="self-center px-2 py-1 text-[12.5px] font-semibold text-sys-label-neutral transition-colors hover:text-sys-label-strong disabled:opacity-50"
    >
      {LEAVE_LABEL}
    </button>
  );
}
