"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { ChatBubble } from "@/components/split/ChatBubble";
import type { Candidate } from "@/components/demo/types";

/**
 * Candidate pick screen (docs/features/02-demo-braindump.md §3.2): the
 * extracted candidates appear as one-line lightweight cards — no `big` badge,
 * no extra metadata (00 결정 7) — and the visitor confirms 1~3 of them as
 * today's cards. Confirming triggers a short promote transition, then hands
 * the selection up to DemoFlow.
 */

const GUIDE = "이 중에 오늘 반드시 끝내고 싶은 일들이 있나요?";
/**
 * 고르기 전에 두 가지를 미리 알려둔다: (1) 이 목록이 방금 쏟아낸 내 이야기에서
 * 나왔다는 것 — 없으면 "내가 적은 일은 어디 갔지?"로 읽힌다, (2) 상한이 3개라는
 * 것 — 4번째를 눌러서야 알게 되면 "왜 안 눌리지?"로 당황한다.
 */
const PICK_HINT =
  "쏟아낸 이야기에서 찾은 일들이에요 · 최대 3개까지 고를 수 있어요";
const CAP_NOTICE = "한 3개만 골라볼까요? 고른 일은 오늘 꼭 끝내봐요.";
const MAX_SELECTED = 3;
/** 카드 승격 연출 길이 — 짧은 CSS 전환 수준으로 절제 (02 §3.2). */
const PROMOTE_MS = 360;

export function CandidatesPhase({
  candidates,
  onConfirm,
  onBack,
}: {
  candidates: Candidate[];
  /** 1~3개 확정 — 전환은 부모(DemoFlow)가 한다. */
  onConfirm: (selected: Candidate[]) => void;
  /** "다시 쏟아내기" — 브레인덤프로 복귀 (기존 입력 프리필). */
  onBack: () => void;
}) {
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [capNotice, setCapNotice] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const count = candidates.filter((_, i) => selected[i]).length;

  function toggle(index: number) {
    if (confirming) return;
    // 4번째 선택은 반영하지 않고 부드럽게만 알린다 (02 §3.2).
    if (!selected[index] && count >= MAX_SELECTED) {
      setCapNotice(true);
      return;
    }
    setCapNotice(false);
    setSelected((prev) => ({ ...prev, [index]: !prev[index] }));
  }

  function confirm() {
    if (count === 0 || confirming) return;
    setConfirming(true);
    // 선택 항목이 잠깐 떠오르는 승격 연출 뒤 확정 — TODO Card 승격의 시각화.
    window.setTimeout(
      () => onConfirm(candidates.filter((_, i) => selected[i])),
      PROMOTE_MS,
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 순차 등장 스태거용 keyframes — 10개가 한꺼번에 보여 압도되지 않게 (02 §3.2) */}
      <style>{`@keyframes demo-candidate-in{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}`}</style>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="flex flex-col gap-3">
          <ChatBubble role="ai">{GUIDE}</ChatBubble>
          <p className="-mt-1 px-1 text-[12px] leading-[1.5] text-sys-label-neutral">
            {PICK_HINT}
          </p>

          <div className="flex flex-col gap-[7px] pt-0.5">
            {candidates.map((candidate, i) => {
              const isSelected = !!selected[i];
              return (
                <button
                  key={`${i}-${candidate.title}`}
                  type="button"
                  role="checkbox"
                  aria-checked={isSelected}
                  onClick={() => toggle(i)}
                  style={{
                    animation: "demo-candidate-in 0.35s ease-out both",
                    animationDelay: `${i * 70}ms`,
                  }}
                  className={`flex items-center gap-2.5 rounded-[12px] border px-[14px] py-[13px] text-left transition-all duration-300 ${
                    isSelected
                      ? "border-sys-primary bg-sys-primary-lighter"
                      : "border-sys-line-strong bg-sys-bg-gray"
                  } ${
                    confirming
                      ? isSelected
                        ? "scale-[1.02] shadow-[0_9px_24px_-6px_rgba(106,69,231,0.35)]"
                        : "opacity-40"
                      : ""
                  }`}
                >
                  <span
                    className={`flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-[6px] border-[1.5px] transition-colors ${
                      isSelected
                        ? "border-sys-primary bg-sys-primary text-sys-on-primary"
                        : "border-sys-label-alt bg-sys-bg text-transparent"
                    }`}
                  >
                    <Icon name="check" size={12} strokeWidth={3} />
                  </span>
                  <span
                    className={`text-[14px] leading-[1.45] ${
                      isSelected
                        ? "font-medium text-sys-label-strong"
                        : "text-sys-label-normal"
                    }`}
                  >
                    {candidate.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 하단 액션 바 — 확정(주 행동 1개) + 다시 쏟아내기 보조 동선 */}
      <div className="flex flex-col gap-2.5 border-t border-sys-line px-5 py-3">
        {capNotice && (
          <p
            aria-live="polite"
            className="text-center text-[12.5px] text-sys-label-neutral"
          >
            {CAP_NOTICE}
          </p>
        )}
        <button
          type="button"
          onClick={confirm}
          disabled={count === 0 || confirming}
          className="w-full rounded-[12px] bg-sys-primary-dark py-[13px] text-[14.5px] font-bold text-sys-on-primary transition-opacity disabled:opacity-40"
        >
          이대로 확정 ({count}개)
        </button>
        <button
          type="button"
          onClick={onBack}
          disabled={confirming}
          className="self-center text-[13px] font-semibold text-sys-label-neutral transition-colors hover:text-sys-label-strong disabled:opacity-50"
        >
          다시 쏟아내기
        </button>
      </div>
    </div>
  );
}
