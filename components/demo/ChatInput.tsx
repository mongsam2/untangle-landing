"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/components/Icon";

/**
 * 한국어 조합을 보호하고 내용에 맞춰 높이가 늘어나는 대화 입력이다.
 * IME 조합 판정과 높이 측정이 브라우저 이벤트와 레이아웃 값을 요구한다.
 * 전송 상한은 UTF-16 길이가 아니라 사용자에게 보이는 코드 포인트로 적용한다.
 */

export function ChatInput({
  value,
  onChange,
  onSend,
  placeholder,
  disabled = false,
  maxLength,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  placeholder: string;
  disabled?: boolean;
  maxLength?: number;
}) {
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // 남아 있는 인라인 height 때문에 scrollHeight가 줄지 않으므로,
  // 커밋된 DOM에서 auto로 되돌린 뒤 다시 재야 한 줄까지 다시 줄어든다.
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    area.style.height = "auto";
    area.style.height = `${Math.min(area.scrollHeight, 112)}px`;
  }, [value]);

  const characterCount = Array.from(value).length;
  const sendDisabled = disabled || characterCount === 0;

  return (
    <div>
      <div className="flex items-end gap-2 rounded-[16px] border border-sys-line bg-sys-bg px-3 py-1.5 transition-shadow focus-within:border-sys-primary-dark focus-within:ring-2 focus-within:ring-sys-primary-lighter">
        <textarea
          ref={areaRef}
          value={value}
          rows={1}
          aria-label="대화 내용"
          aria-describedby={maxLength ? "demo-chat-count" : undefined}
          onChange={(event) => {
            const characters = Array.from(event.target.value);
            onChange(
              maxLength && characters.length > maxLength
                ? characters.slice(0, maxLength).join("")
                : event.target.value,
            );
          }}
          onKeyDown={(event) => {
            // 한글 음절을 확정하는 Enter는 전송으로 해석하지 않는다.
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (!sendDisabled) onSend();
            }
          }}
          placeholder={placeholder}
          className="max-h-28 min-h-9 flex-1 resize-none overflow-y-auto bg-transparent py-1.5 text-[16px] leading-[1.5] text-sys-label-strong outline-none placeholder:text-sys-label-neutral"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={sendDisabled}
          aria-label={
            disabled ? "지금은 메시지를 보낼 수 없음" : "메시지 보내기"
          }
          className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sys-primary-dark text-sys-on-primary transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sys-primary-dark disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Icon name="arrow-up" size={18} strokeWidth={2.4} />
        </button>
      </div>
      {maxLength &&
        (characterCount >= Math.floor(maxLength * 0.9) ? (
          <p
            id="demo-chat-count"
            aria-live="polite"
            className="pt-1 text-right text-[11px] text-sys-label-neutral"
          >
            {characterCount.toLocaleString("ko-KR")} /{" "}
            {maxLength.toLocaleString("ko-KR")}자
          </p>
        ) : (
          <span id="demo-chat-count" className="sr-only">
            최대 {maxLength.toLocaleString("ko-KR")}자
          </span>
        ))}
    </div>
  );
}
