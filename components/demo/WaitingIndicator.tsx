"use client";

import { useEffect, useState } from "react";

/**
 * AI가 답을 만드는 동안 짧은 진행 문구를 순환해 멈춘 화면처럼 보이지 않게 한다.
 * 타이머로 문구를 바꾸므로 클라이언트 컴포넌트로 둔다.
 * 오래 걸릴 때는 같은 자리에서 추가 안내를 보여준다.
 */

const SLOW_NOTICE = "조금만 더 걸려요. 그대로 있어 주세요.";
const ROTATE_MS = 2_500;
const SLOW_MS = 8_000;

export function WaitingIndicator({ messages }: { messages: string[] }) {
  const [index, setIndex] = useState(0);
  const [slow, setSlow] = useState(false);

  // 두 타이머는 컴포넌트가 사라질 때 함께 정리해 이전 요청의 안내가 남지 않게 한다.
  useEffect(() => {
    const rotate = setInterval(
      () => setIndex((current) => (current + 1) % messages.length),
      ROTATE_MS,
    );
    const slowTimer = setTimeout(() => setSlow(true), SLOW_MS);
    return () => {
      clearInterval(rotate);
      clearTimeout(slowTimer);
    };
  }, [messages.length]);

  return (
    <div className="flex justify-start" role="status" aria-live="polite">
      <div className="flex flex-col gap-1 rounded-[16px] rounded-tl-[5px] bg-sys-bg-gray px-[15px] py-[11px]">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1" aria-hidden="true">
            {[0, 1, 2].map((dot) => (
              <span
                key={dot}
                className="h-[5px] w-[5px] animate-bounce rounded-full bg-sys-label-neutral motion-reduce:animate-none"
                style={{ animationDelay: `${dot * 0.15}s` }}
              />
            ))}
          </span>
          <span className="text-[13.5px] text-sys-label-neutral">
            {messages[index % messages.length]}
          </span>
        </div>
        {slow && (
          <span className="text-[12px] text-sys-label-neutral">
            {SLOW_NOTICE}
          </span>
        )}
      </div>
    </div>
  );
}
