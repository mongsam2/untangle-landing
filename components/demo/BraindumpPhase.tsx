"use client";

import { useEffect, useRef, useState } from "react";
import { ChatBubble } from "@/components/split/ChatBubble";
import { OptionChips } from "@/components/split/OptionChips";
import { ChatInput } from "@/components/demo/ChatInput";
import { WaitingIndicator } from "@/components/demo/WaitingIndicator";
import type {
  BraindumpRequest,
  BraindumpResponse,
  Candidate,
} from "@/components/demo/types";
import { track } from "@/lib/analytics";

/**
 * Braindump screen (docs/features/02-demo-braindump.md §3.1): the visitor dumps
 * whatever is on their mind, we POST it to /api/braindump, and hand the
 * extracted candidates up to DemoFlow. A "retry" answer keeps them here with
 * fresh examples instead of questioning them back (PRD 5.1).
 */

// 무엇을 해주는지 먼저 약속한다 — "쏟아내라"까지만 읽으면 "그래서 뭘 해준다는
// 거지?"에서 멈추고, 결과가 나왔을 때도 "갑자기 할 일만 나왔다"고 느낀다.
const WELCOME =
  "요즘 머릿속에 맴도는 일들을 편하게 쏟아내 보세요. 다 적으면 그 안에서 오늘 할 일 후보를 하나씩 꺼내 드릴게요. 문장이 아니어도 괜찮아요.";
// 길면 무엇을 적으라는 건지 읽히지 않는다 — 형식만 보여주는 정도로 짧게.
const PLACEHOLDER = "예: 과제도 밀렸고, 방도 치워야 하고…";
/** 키보드가 올라오면 위쪽 말풍선이 가려진다 — 약속은 입력창 옆에 항상 남긴다. */
const INPUT_HINT = "쏟아낸 내용에서 오늘 할 일 후보를 찾아드려요";
// 빈 화면 공포가 최대 이탈 요인 — 원탭으로 입력창에 채워지고 수정 가능 (02 §3.1)
const EXAMPLES = [
  "과제 2개랑 빨래가 밀렸어",
  "자소서 써야 하는데 손이 안 가",
  "시험공부 뭐부터 할지 모르겠어",
];
const WAITING_MESSAGES = [
  "머릿속을 펼쳐보는 중…",
  "할 일 모양으로 빚는 중…",
  "거의 다 됐어요",
];
const NETWORK_ERROR = "연결에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.";
const TIMEOUT_ERROR = "응답이 오래 걸려 잠시 멈췄어요. 다시 시도해 주세요.";
const MAX_LENGTH = 2000;
const TIMEOUT_MS = 20_000;

type LogItem = { id: number; role: "user" | "ai"; text: string };

export function BraindumpPhase({
  initialText,
  onCandidates,
}: {
  /** "다시 쏟아내기"로 복귀했을 때 이전 원문을 프리필한다 (02 §3.2). */
  initialText: string;
  onCandidates: (braindump: string, candidates: Candidate[]) => void;
}) {
  const [log, setLog] = useState<LogItem[]>([
    { id: 0, role: "ai", text: WELCOME },
  ]);
  const [input, setInput] = useState(initialText);
  const [examples, setExamples] = useState<string[]>(EXAMPLES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState<(() => void) | null>(null);

  const logCounter = useRef(1);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [log, loading, examples, error]);

  const appendAi = (text: string) => {
    if (!text?.trim()) return;
    setLog((prev) => [...prev, { id: logCounter.current++, role: "ai", text }]);
  };
  const appendUser = (text: string) =>
    setLog((prev) => [
      ...prev,
      { id: logCounter.current++, role: "user", text },
    ]);

  async function runExtract(braindump: string) {
    setLoading(true);
    setError(null);
    setRetry(null);
    // 에러 시 입력 텍스트 보존: 비운 입력창을 되살려 수정·재전송할 수 있게 한다.
    const fail = (message: string) => {
      setError(message);
      setRetry(() => () => runExtract(braindump));
      setInput((cur) => (cur ? cur : braindump));
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      // provider는 보내지 않는다 — 서버 기본값 Claude (02 §4).
      const body: BraindumpRequest = { braindump };
      const res = await fetch("/api/braindump", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data = (await res.json()) as BraindumpResponse;
      if ("error" in data) {
        fail(data.error);
        return;
      }
      if (data.status === "ok") {
        // 전환은 부모(DemoFlow)가 한다 — 이 컴포넌트는 결과만 올린다.
        onCandidates(braindump, data.candidates);
        return;
      }
      // retry: 되묻는 대신 예시로 다시 돕는다 (PRD 5.1) — 이 화면에 잔류.
      appendAi(data.message);
      setExamples(data.examples);
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      fail(aborted ? TIMEOUT_ERROR : NETWORK_ERROR);
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }

  function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    // 원문은 남기지 않는다 — 글자수만(빈 화면 공포 이탈 대비 전송 신호).
    track("braindump_submitted", { length: text.length });
    appendUser(text);
    setInput("");
    setExamples([]);
    void runExtract(text);
  }

  function retryNow() {
    if (!retry) return;
    const run = retry;
    setError(null);
    setRetry(null);
    run();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="flex flex-col gap-3">
          {log.map((item) => (
            <ChatBubble key={item.id} role={item.role}>
              {item.text}
            </ChatBubble>
          ))}

          {loading && <WaitingIndicator messages={WAITING_MESSAGES} />}

          {!loading && examples.length > 0 && (
            <div className="pt-0.5">
              <OptionChips
                options={examples}
                onPick={(text) => setInput(text)}
              />
            </div>
          )}

          {error && (
            <div className="rounded-[12px] border border-sys-pri-high/30 bg-sys-pri-high-bg px-[14px] py-2.5 text-[13px] leading-[1.5] text-sys-pri-high">
              {error}
              {retry && (
                <button
                  type="button"
                  onClick={retryNow}
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

      <div className="border-t border-sys-line px-4 py-3">
        {/* 스크롤 로그가 아니라 입력창에 붙여둔다 — 키보드가 올라와도 보인다. */}
        <p className="px-1 pb-1.5 text-[12px] leading-[1.5] text-sys-label-neutral">
          {INPUT_HINT}
        </p>
        <ChatInput
          value={input}
          onChange={setInput}
          onSend={handleSend}
          placeholder={PLACEHOLDER}
          disabled={loading}
          maxLength={MAX_LENGTH}
        />
      </div>
    </div>
  );
}
