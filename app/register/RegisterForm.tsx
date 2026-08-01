"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { submitFeedback } from "@/app/register/actions";
import { initialFeedbackState } from "@/app/register/feedback-state";
import { track } from "@/lib/analytics";

/**
 * Interactive part of the experience-feedback screen (the `/register` route,
 * repurposed from pre-registration to a satisfaction survey).
 *
 * Client Component so the page can stay a Server Component (keeping `metadata`).
 * `useState` drives the conditional reason block — it only appears for low
 * scores (1–3) — while `useActionState` drives submit / pending / success.
 *
 * 사전 신청(이메일)과 사용자 인터뷰 의향도 이 폼에서 함께 묻는다. 체험을
 * 마쳤거나 중간에 그만둔 사람만 이 화면에 도착하므로, 랜딩에는 사전 신청·소감
 * 어느 쪽도 노출되지 않는다. 이메일은 끝까지 선택 항목이라 비워둔 채로도
 * 소감이 접수된다. 단, 인터뷰 의향에 체크하면 연락할 방법이 필요하므로
 * 연락처가 필수가 된다(서버에서 최종 검증).
 */

const RATINGS = [
  { value: 1, label: "아쉬웠어요" },
  { value: 2, label: "그저 그랬어요" },
  { value: 3, label: "괜찮았어요" },
  { value: 4, label: "좋았어요" },
  { value: 5, label: "정말 좋았어요" },
];

// Shown only for low scores (1–3). Placeholder options — the final list is
// still to be decided in a follow-up; keep this array as the single source.
const LOW_REASONS = [
  "어디에 도움이 될지 모르겠어요",
  "AI 답변이 내 상황과 안 맞았어요",
  "할 일 쪼개기 결과가 아쉬웠어요",
  "쓰기가 번거롭거나 어려웠어요",
  "기대했던 것과 달랐어요",
  "기타",
];

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(
    submitFeedback,
    initialFeedbackState,
  );
  const [rating, setRating] = useState<number | null>(null);
  const [reason, setReason] = useState<string>("");
  // Controlled so a typed "기타" value survives the reason block unmounting when
  // the score is briefly raised to 4–5 and lowered again — otherwise it would
  // submit an empty reason despite "기타" still being selected.
  const [reasonEtc, setReasonEtc] = useState<string>("");
  // 이 폼의 모든 입력은 controlled여야 한다. React는 form action을 실행하기 전에
  // requestFormReset을 무조건 예약하므로(react-dom-client: startHostTransition),
  // 액션이 error를 돌려줘도 비제어 필드는 빈 값으로 리셋된다. 오류를 한 번에
  // 모아 돌려주는 이유가 "다시 적게 만들지 않기"인데, 정작 가장 길게 쓴 자유
  // 의견이 그 왕복에서 사라지면 앞뒤가 맞지 않는다.
  const [contact, setContact] = useState<string>("");
  const [comment, setComment] = useState<string>("");
  // 인터뷰 의향 체크박스도 controlled — 비제어면 오류 왕복에서 체크가 풀린다.
  const [interview, setInterview] = useState<boolean>(false);
  const showReason = rating !== null && rating <= 3;
  const ratingError = state.status === "error" ? state.errors?.rating : undefined;
  const contactError = state.status === "error" ? state.errors?.contact : undefined;

  // 소감 제출 성공 시 한 번만 — 평점·연락처 유무만 남긴다(자유 의견 원문 제외).
  // 같은 익명 distinct_id에 붙어 "퍼널 깊이 × 만족도" 상관을 볼 수 있다.
  const feedbackLogged = useRef(false);
  useEffect(() => {
    if (state.status === "success" && !feedbackLogged.current) {
      feedbackLogged.current = true;
      track("feedback_submitted", {
        rating: rating ?? undefined,
        has_contact: contact.trim().length > 0,
        subscribed: !!state.subscribed,
        interview_opted_in: !!state.interviewRequested,
      });
    }
  }, [state, rating, contact]);

  if (state.status === "success") {
    return (
      <div className="flex flex-col items-center gap-4 pt-10 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-sys-primary text-sys-on-primary">
          <Icon name="check" size={28} strokeWidth={2.5} />
        </span>
        <h2 className="text-[22px] font-bold tracking-[-0.3px] text-sys-label-strong">
          {state.subscribed ? "소감과 사전 신청, 잘 받았어요" : "소감을 보냈어요"}
        </h2>
        <p className="text-[15px] leading-[1.6] text-sys-label-neutral">
          {state.interviewRequested ? (
            <>
              고마워요! 남겨주신 연락처로 인터뷰 일정을
              <br />
              곧 여쭤보고, 출시 소식도 가장 먼저 알려드릴게요.
            </>
          ) : state.subscribed ? (
            <>
              고마워요! 준비가 되면
              <br />
              남겨주신 연락처로 가장 먼저 알려드릴게요.
            </>
          ) : (
            <>
              고마워요! 남겨주신 한 마디로
              <br />
              다음 걸음을 더 다정하게 만들어볼게요.
            </>
          )}
        </p>
        <Link
          href="/"
          className="mt-2 text-[14px] font-semibold text-sys-primary-dark"
        >
          홈으로 돌아가기
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-7 pt-7">
      {/* Honeypot — hidden from users; bots that fill it are silently dropped. */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />
      <input type="hidden" name="rating" value={rating ?? ""} />

      {/* Rating */}
      <div className="flex flex-col gap-3">
        <span className="text-[14px] font-semibold text-sys-label-strong">
          방금 체험, 어떠셨어요?
        </span>
        <div
          role="radiogroup"
          aria-label="만족도"
          aria-invalid={ratingError ? true : undefined}
          aria-describedby={ratingError ? "rating-error" : undefined}
          className="flex gap-2"
        >
          {RATINGS.map((r) => {
            const selected = rating === r.value;
            return (
              <button
                key={r.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setRating(r.value)}
                aria-label={`${r.value}점 · ${r.label}`}
                className={`flex h-[52px] flex-1 items-center justify-center rounded-xl border text-[17px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sys-primary focus-visible:ring-offset-2 ${
                  selected
                    ? "border-sys-primary bg-sys-primary text-sys-on-primary"
                    : "border-sys-line bg-sys-bg text-sys-label-strong hover:border-sys-primary-lighter"
                }`}
              >
                {r.value}
              </button>
            );
          })}
        </div>
        <div className="flex justify-between text-[12px] text-sys-label-alt">
          <span>아쉬웠어요</span>
          <span>정말 좋았어요</span>
        </div>
        {rating !== null && (
          <p className="text-[13px] font-semibold text-sys-primary-dark">
            {RATINGS.find((r) => r.value === rating)?.label}
          </p>
        )}
        {ratingError && (
          <span id="rating-error" role="alert" className="text-[13px] text-red-500">
            {ratingError}
          </span>
        )}
      </div>

      {/* Reason — only for low scores. Optional. */}
      {showReason && (
        <div className="flex flex-col gap-2.5">
          <span className="text-[14px] font-semibold text-sys-label-strong">
            어떤 점이 아쉬우셨어요?{" "}
            <span className="font-normal text-sys-label-alt">(선택)</span>
          </span>
          <div className="flex flex-col gap-2">
            {LOW_REASONS.map((opt) => {
              const selected = reason === opt;
              return (
                <label
                  key={opt}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-4 py-3 text-[14px] transition-colors ${
                    selected
                      ? "border-sys-primary bg-sys-primary-lighter text-sys-label-strong"
                      : "border-sys-line bg-sys-bg text-sys-label-neutral hover:border-sys-primary-lighter"
                  }`}
                >
                  <input
                    type="radio"
                    name="reason"
                    value={opt}
                    checked={selected}
                    onChange={() => setReason(opt)}
                    className="peer sr-only"
                  />
                  <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-sys-label-alt peer-checked:border-sys-primary peer-checked:bg-sys-primary peer-focus-visible:ring-2 peer-focus-visible:ring-sys-primary peer-focus-visible:ring-offset-2">
                    {selected && (
                      <span className="h-[7px] w-[7px] rounded-full bg-sys-on-primary" />
                    )}
                  </span>
                  {opt}
                </label>
              );
            })}
          </div>
          {reason === "기타" && (
            <input
              type="text"
              name="reasonEtc"
              value={reasonEtc}
              onChange={(e) => setReasonEtc(e.target.value)}
              placeholder="어떤 점이 아쉬웠는지 적어주세요"
              className="h-[48px] rounded-xl border border-sys-line bg-sys-bg px-4 text-[16px] text-sys-label-strong outline-none placeholder:text-sys-label-alt focus:border-sys-primary focus:ring-2 focus:ring-sys-primary-lighter"
            />
          )}
        </div>
      )}

      {/* Free-form comment — always shown, always optional. */}
      <div className="flex flex-col gap-2.5">
        <span className="text-[14px] font-semibold text-sys-label-strong">
          하고 싶은 말이 있다면요{" "}
          <span className="font-normal text-sys-label-alt">(선택)</span>
        </span>
        <textarea
          name="comment"
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="좋았던 점이든 바라는 점이든, 자유롭게 남겨주세요"
          className="min-h-[92px] resize-none rounded-xl border border-sys-line bg-sys-bg px-4 py-3 text-[16px] leading-[1.5] text-sys-label-strong outline-none placeholder:text-sys-label-alt focus:border-sys-primary focus:ring-2 focus:ring-sys-primary-lighter"
        />
      </div>

      {/* 사전 신청 — 소감과 같은 화면에서 함께 묻되 언제나 선택. 비워도 소감은
          그대로 접수되므로 제출률을 막지 않는다. 랜딩에는 이 동선이 없다. */}
      <div className="flex flex-col gap-2.5">
        <span className="text-[14px] font-semibold text-sys-label-strong">
          정식 출시되면 알려드릴까요?{" "}
          <span className="font-normal text-sys-label-alt">(선택)</span>
        </span>
        {/* type="email"이면 브라우저가 전화번호를 반려한다 — 어느 쪽으로 연락받을지는
            사용자가 고르는 것이므로 형식은 서버에서 둘 다 받아준다. */}
        <input
          type="text"
          name="contact"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="이메일 또는 휴대폰 번호"
          maxLength={254}
          aria-invalid={contactError ? true : undefined}
          aria-describedby={contactError ? "contact-error" : undefined}
          className={`h-[48px] rounded-xl border bg-sys-bg px-4 text-[16px] text-sys-label-strong outline-none placeholder:text-sys-label-alt focus:ring-2 ${
            contactError
              ? "border-red-400 focus:border-red-400 focus:ring-red-100"
              : "border-sys-line focus:border-sys-primary focus:ring-sys-primary-lighter"
          }`}
        />
        {contactError && (
          <span id="contact-error" role="alert" className="text-[13px] text-red-500">
            {contactError}
          </span>
        )}

        {/* 인터뷰 의향 — 항상 선택. 체크하면 연락할 방법이 필요해져 연락처가
            필수로 승격된다(최종 검증은 서버). 연락처 입력과 같은 묶음에 두어
            "이 연락처로 인터뷰 연락이 간다"는 관계가 눈에 보이게 한다. */}
        <label
          className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-4 py-3 transition-colors ${
            interview
              ? "border-sys-primary bg-sys-primary-lighter"
              : "border-sys-line bg-sys-bg hover:border-sys-primary-lighter"
          }`}
        >
          <input
            type="checkbox"
            name="interview"
            checked={interview}
            onChange={(e) => setInterview(e.target.checked)}
            className="peer sr-only"
          />
          <span className="mt-[1px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] border-sys-label-alt text-sys-on-primary peer-checked:border-sys-primary peer-checked:bg-sys-primary peer-focus-visible:ring-2 peer-focus-visible:ring-sys-primary peer-focus-visible:ring-offset-2">
            {interview && <Icon name="check" size={12} strokeWidth={3} />}
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-[14px] font-medium text-sys-label-strong">
              출시 전 15~20분 인터뷰에 참여할 수 있어요
            </span>
            <span className="text-[12px] leading-[1.5] text-sys-label-alt">
              체험하며 느끼신 점을 편하게 듣는 자리예요. 남겨주신 연락처로
              일정을 여쭤볼게요.
            </span>
          </span>
        </label>
        {interview && contact.trim().length === 0 && !contactError && (
          <p className="text-[12px] font-semibold leading-[1.5] text-sys-primary-dark">
            인터뷰 연락을 드리려면 위에 이메일이나 휴대폰 번호를 남겨주세요.
          </p>
        )}

        {/* 수집 항목·목적·보유기간을 적는 지점. 연락처는 선택 항목이라 별도
            동의 체크박스 대신 고지와 링크로 갈음한다. 이용 목적(출시 안내·
            인터뷰 요청)은 체크 여부와 무관하게 항상 명시한다 — 연락처를 남긴
            분에게는 인터뷰를 여쭤볼 수 있기 때문. 인터뷰에 체크하면 연락처가
            필수가 되어 "비워도 된다"는 안내만 조건부로 감춘다. 처리방침은 새
            탭으로 열어 작성 중인 소감이 날아가지 않게 한다. */}
        <p className="text-[12px] leading-[1.5] text-sys-label-alt">
          적어주신 연락처는 출시 안내와 인터뷰 요청 연락에 쓰일 수 있고, 쓰임을
          다한 뒤 바로 지워요.{interview ? "" : " 비워두셔도 괜찮아요."}{" "}
          <Link
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-sys-label-neutral underline"
          >
            개인정보 처리방침
          </Link>
        </p>
      </div>

      {state.status === "error" && state.message && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-4 py-3 text-center text-[13px] leading-[1.5] text-red-600"
        >
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="h-[54px] rounded-xl bg-sys-primary-dark text-[16px] font-bold text-sys-on-primary shadow-[0_9px_24px_-2px_rgba(106,69,231,0.25)] transition-shadow hover:shadow-[0_12px_28px_-2px_rgba(106,69,231,0.4)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "보내는 중…" : "사전 신청하기"}
      </button>

      <p className="text-center text-[12px] leading-[1.5] text-sys-label-alt">
        딱 10초면 끝나요. 남겨주신 한 마디로 더 나은 첫 걸음을 같이 만들어가요.
      </p>
    </form>
  );
}
