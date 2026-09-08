"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { CtaButton } from "@/components/CtaButton";
import {
  hasAnyCheck,
  initialDemoState,
  isCardDone,
} from "@/components/demo/state";
import type { DemoCard } from "@/components/demo/types";
import { MAX_RESPLITS } from "@/components/split/useSplitFlow";
import { track } from "@/lib/analytics";

/**
 * Today execution screen — phase "today" (docs/features/04-demo-today.md).
 *
 * AI와의 대화가 끝나고 도착하는 순수한 투두 리스트다 — 코치 말풍선 등 채팅
 * 요소는 없다. Confirmed cards only, one card open at a time (아코디언 —
 * "실행은 한 번에 하나"). Every checkbox here means "완료". The first check
 * anywhere is the demo's success signal: 1.2s later the one-shot feedback
 * slide-up appears (04 §3.4). Restraint rules apply throughout — no timers,
 * no confetti, no next-day talk (00 §6, 04 §3.3).
 */

const REGISTER_HREF = "/register?from=demo";
const SLIDEUP_DELAY_MS = 1200;

const CARD_DONE_LINE = "이 일을 끝까지 마쳤어요. 잘하고 있어요.";
const ALL_DONE_BANNER = "오늘 정한 일을 전부 끝냈어요";
// "소감"은 좋았던 점을 써야 할 것처럼 읽힌다 — 아쉬웠던 말도 환영한다는 신호를
// 라벨에 담는다. 이 CTA가 닿는 화면에서 사전 신청도 함께 묻는다.
const CTA_LABEL = "솔직한 느낌 들려주기";

export function TodayPhase({
  cards,
  slideupShown,
  onToggleFirstStep,
  onToggleSubtask,
  onToggleCardDone,
  onSplitCard,
  onSlideupShown,
  onRestart,
}: {
  cards: DemoCard[];
  slideupShown: boolean;
  onToggleFirstStep: (cardId: string) => void;
  onToggleSubtask: (cardId: string, subtaskId: string) => void;
  /** 미분해 카드만 — 쪼갠 카드는 서브태스크로만 완료된다 (04 §3.2). */
  onToggleCardDone: (cardId: string) => void;
  /** 쪼개기/다시 쪼개기 재진입 (03 §3.3). */
  onSplitCard: (cardId: string) => void;
  onSlideupShown: () => void;
  /** 인라인 확인 1회 뒤에만 호출한다. */
  onRestart: () => void;
}) {
  const anyCheck = hasAnyCheck({ ...initialDemoState, cards });
  const allDone = cards.length > 0 && cards.every(isCardDone);

  // 데모의 성공 신호 — 어디든 첫 체크가 생기는 순간 한 번만 남긴다.
  const firstCheckLogged = useRef(false);
  useEffect(() => {
    if (anyCheck && !firstCheckLogged.current) {
      firstCheckLogged.current = true;
      track("first_check_success");
    }
  }, [anyCheck]);

  // 슬라이드업: 첫 체크 && 미노출 → 1.2초 뒤 표시 (04 §3.4). 1.2초 안에 체크를
  // 되돌리면 cleanup이 타이머를 취소하고, 노출 즉시 onSlideupShown을 알린다.
  const [slideupOpen, setSlideupOpen] = useState(false);
  useEffect(() => {
    if (!anyCheck || slideupShown) return;
    const timer = setTimeout(() => {
      setSlideupOpen(true);
      onSlideupShown();
    }, SLIDEUP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [anyCheck, slideupShown, onSlideupShown]);

  const [confirmingRestart, setConfirmingRestart] = useState(false);

  // TodayPhase는 저장 상태 복원 뒤(클라이언트)에만 마운트되므로 하이드레이션
  // 불일치 걱정 없이 렌더 시점의 날짜를 쓴다.
  const dateLabel = new Date().toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="flex flex-col gap-3">
          {/* 전체 완료 배너 — 다음날 이야기는 하지 않는다 (04 §3.3-3) */}
          {allDone && (
            <div className="rounded-[16px] bg-sys-primary-lighter px-5 py-5">
              <p className="text-center text-[15.5px] font-bold leading-[1.5] text-sys-primary-dark">
                {ALL_DONE_BANNER}
              </p>
              <CtaButton
                label={CTA_LABEL}
                href={REGISTER_HREF}
                className="mt-4"
                tracking={{
                  event: "demo_cta_clicked",
                  props: { surface: "all_done" },
                }}
              />
            </div>
          )}

          {/* Header: 날짜 + 오늘 할 일 N개 — 통계·스트릭·달력 없음 (04 §3.1) */}
          <div>
            <p className="text-[13px] font-semibold text-sys-primary-dark">
              {dateLabel}
            </p>
            <h2 className="pt-0.5 text-[19px] font-bold leading-[1.4] text-sys-label-strong">
              오늘 할 일 {cards.length}개
            </h2>
          </div>

          {cards.map((card) => (
            <TodayCard
              key={card.id}
              card={card}
              onFirstStep={() => onToggleFirstStep(card.id)}
              onSubtask={(subtaskId) => onToggleSubtask(card.id, subtaskId)}
              onCardDone={() => onToggleCardDone(card.id)}
              onSplit={() => onSplitCard(card.id)}
            />
          ))}

          {/* 처음부터 — 인라인 2단계 확인, window.confirm 금지 (04 §3.1) */}
          <div className="flex items-center justify-center pb-1 pt-2">
            {confirmingRestart ? (
              <div className="flex items-center gap-4">
                <span className="text-[13px] text-sys-label-neutral">
                  정말요?
                </span>
                <button
                  type="button"
                  onClick={onRestart}
                  className="text-[13px] font-bold text-sys-primary-dark"
                >
                  네, 처음부터
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingRestart(false)}
                  className="text-[13px] font-semibold text-sys-label-neutral"
                >
                  아니요
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingRestart(true)}
                className="text-[12.5px] text-sys-label-alt transition-colors hover:text-sys-label-neutral"
              >
                처음부터 다시 해보기
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 하단 고정: 슬라이드업 → 축소 후엔 미니 바 상시 유지 (04 §3.4) */}
      {slideupOpen ? (
        <SlideupCard
          count={cards.length}
          onCollapse={() => setSlideupOpen(false)}
        />
      ) : slideupShown ? (
        <MiniBar />
      ) : null}
    </div>
  );
}

/** One TODO Card — 기본 펼침. 쪼갠 카드만 헤드를 터치해 접었다 펼 수 있다. */
function TodayCard({
  card,
  onFirstStep,
  onSubtask,
  onCardDone,
  onSplit,
}: {
  card: DemoCard;
  onFirstStep: () => void;
  onSubtask: (subtaskId: string) => void;
  onCardDone: () => void;
  onSplit: () => void;
}) {
  const split = card.subtasks.length > 0;
  const done = isCardDone(card);
  const doneCount = card.subtasks.filter((s) => s.done).length;
  const [collapsed, setCollapsed] = useState(false);

  const title = (
    <span
      className={`min-w-0 flex-1 text-left text-[15px] font-medium leading-[1.4] ${
        done ? "text-sys-primary-dark" : "text-sys-label-strong"
      }`}
    >
      {card.title}
    </span>
  );

  return (
    <div
      className={`rounded-[14px] border transition-colors ${
        done
          ? "border-sys-primary-light bg-sys-bg-violet" // 채움 전환 — 취소선 아님 (04 §3.3-2)
          : "border-sys-line-strong bg-sys-bg"
      }`}
    >
      {/* 헤드 행: 제목 + (쪼갠 카드: 진행 배지 / 미분해: 완료 체크박스) */}
      {split ? (
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          aria-expanded={!collapsed}
          className="flex w-full items-center gap-2.5 px-[14px] py-3"
        >
          {title}
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold transition-colors ${
              done
                ? "bg-sys-primary text-sys-on-primary"
                : "bg-sys-primary-lighter text-sys-primary-dark"
            }`}
          >
            {doneCount}/{card.subtasks.length}
          </span>
        </button>
      ) : (
        <div className="flex items-center gap-2.5 px-[14px] py-3">
          <CheckBox checked={card.done} onToggle={onCardDone} />
          {title}
        </div>
      )}

      {/* 카드 완료 — 따뜻한 1문장 (04 §3.3-2) */}
      {done && (
        <p className="-mt-1 px-[14px] pb-3 text-[12.5px] leading-[1.5] text-sys-primary-dark">
          {CARD_DONE_LINE}
        </p>
      )}

      {split ? (
        // 터치로 접힌 동안엔 본문만 숨긴다 — 헤드·완료 문구는 유지
        !collapsed && (
          <div className="flex flex-col gap-[9px] border-t border-sys-line px-[14px] pb-3.5 pt-3">
            {/* 지금 할 첫 단계 — 도착 시 시각적 포커스 (04 §3.1) */}
            {card.firstStep && (
              <div className="rounded-[12px] bg-sys-primary-lighter px-[14px] py-[13px]">
                <div className="mb-2 flex items-center gap-1.5 text-[11.5px] font-bold tracking-[0.4px] text-sys-primary-dark">
                  <Icon name="sparkles" size={13} strokeWidth={2} />
                  지금 할 첫 단계
                </div>
                <div className="flex items-center gap-3">
                  <CheckBox
                    checked={card.firstStep.done}
                    onToggle={onFirstStep}
                  />
                  <span
                    className={`min-w-0 flex-1 text-[14.5px] font-medium leading-[1.45] ${
                      card.firstStep.done
                        ? "text-sys-label-neutral"
                        : "text-sys-label-strong"
                    }`}
                  >
                    {card.firstStep.title}
                  </span>
                </div>
              </div>
            )}

            {/* 순서는 있지만 번호를 붙이지는 않는다 — 투두 항목 옆의 숫자는
                "몇 번째"인지보다 "왜 매겨졌지?"로 먼저 읽힌다. */}
            <ol className="flex flex-col gap-1.5">
              {card.subtasks.map((s) => (
                <li key={s.id} className="flex items-center gap-2.5 py-0.5">
                  <CheckBox
                    small
                    checked={s.done}
                    onToggle={() => onSubtask(s.id)}
                  />
                  <span
                    className={`min-w-0 text-[14px] leading-[1.45] ${
                      s.done
                        ? "text-sys-label-alt line-through"
                        : "text-sys-label-normal"
                    }`}
                  >
                    {s.title}
                  </span>
                </li>
              ))}
            </ol>

            {/* 다시 쪼개기 — 저장된 계획을 열어 전체를 재생성 (03 §3.3).
                횟수를 다 쓴 카드에서는 동선을 아예 내린다: 눌러도 재생성할 수
                없는 버튼을 남겨두면 남은 건 실망뿐이다. */}
            {card.resplitCount < MAX_RESPLITS && (
              <button
                type="button"
                onClick={onSplit}
                className="flex items-center gap-1.5 text-[12.5px] font-semibold text-sys-label-neutral transition-colors hover:text-sys-primary-dark"
              >
                <Icon name="scissors" size={13} strokeWidth={2} />
                다시 쪼개기
              </button>
            )}
          </div>
        )
      ) : (
        <div className="flex flex-col border-t border-sys-line px-[14px] py-3">
          {/* 미분해 카드 — 쪼개기 시작 */}
          <button
            type="button"
            onClick={onSplit}
            className="flex items-center gap-1.5 text-[12.5px] font-semibold text-sys-label-neutral transition-colors hover:text-sys-primary-dark"
          >
            <Icon name="scissors" size={13} strokeWidth={2} />
            쪼개기
          </button>
        </div>
      )}
    </div>
  );
}

/** 완료 체크박스 — split result의 "담을 항목 고르기"와 다른 시각 형태 (04 §3.2). */
function CheckBox({
  checked,
  onToggle,
  small = false,
}: {
  checked: boolean;
  onToggle: () => void;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      role="checkbox"
      aria-checked={checked}
      aria-label="완료 표시"
      className={`flex shrink-0 items-center justify-center border-[1.5px] transition-all duration-150 active:scale-90 ${
        small
          ? "h-[18px] w-[18px] rounded-[6px]"
          : "h-[22px] w-[22px] rounded-[7px]"
      } ${
        checked
          ? "border-sys-primary bg-sys-primary text-sys-on-primary"
          : "border-sys-label-alt bg-sys-bg text-transparent"
      }`}
    >
      <Icon
        name="check"
        size={small ? 11 : 14}
        strokeWidth={2.5}
        className={`transition-transform duration-150 ${checked ? "scale-100" : "scale-50"}`}
      />
    </button>
  );
}

/** 첫 체크 후 하단 슬라이드업 — 모달로 화면을 가로채지 않는다 (04 §3.4). */
function SlideupCard({
  count,
  onCollapse,
}: {
  count: number;
  onCollapse: () => void;
}) {
  // Two-phase mount so the card actually slides in (no global keyframes).
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className={`border-t border-sys-line bg-sys-bg px-6 pb-6 pt-5 shadow-[0_-10px_40px_-10px_rgba(26,26,36,0.18)] transition-all duration-300 ease-out ${
        entered ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
      }`}
    >
      {/* 체험 요약 3줄 — 자기가 만든 결과물이 소감의 재료 (04 §3.4) */}
      <div className="flex flex-col gap-2">
        {["쏟아낸 생각", `오늘 할 일 ${count}개`, "첫 걸음 완료"].map(
          (line, i) => (
            <div
              key={line}
              className="flex items-center gap-2.5 text-[14px] leading-[1.5] text-sys-label-normal"
            >
              <span className="flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full bg-sys-primary-lighter text-[11px] font-bold text-sys-primary-dark">
                {i + 1}
              </span>
              {line}
            </div>
          ),
        )}
      </div>
      <CtaButton
        label={CTA_LABEL}
        href={REGISTER_HREF}
        className="mt-4"
        tracking={{ event: "demo_cta_clicked", props: { surface: "slideup" } }}
      />
      <button
        type="button"
        onClick={onCollapse}
        className="mt-2 w-full py-2 text-[13.5px] font-semibold text-sys-label-neutral transition-colors hover:text-sys-label-strong"
      >
        조금 더 해보기
      </button>
    </div>
  );
}

/** 슬라이드업 축소 후의 하단 고정 미니 바 — 소감 CTA 상시 유지 (04 §3.4). */
function MiniBar() {
  return (
    <div className="border-t border-sys-line bg-sys-bg px-5 py-2.5">
      <Link
        href={REGISTER_HREF}
        onClick={() => track("demo_cta_clicked", { surface: "minibar" })}
        className="flex items-center justify-center gap-1.5 rounded-[12px] py-2 text-[14px] font-semibold text-sys-primary-dark transition-colors hover:bg-sys-primary-lighter"
      >
        {CTA_LABEL}
        <Icon name="arrow-right" size={15} strokeWidth={2.2} />
      </Link>
    </div>
  );
}
