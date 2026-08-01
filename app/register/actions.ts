"use server";

/**
 * Experience-feedback submit action.
 *
 * Collects a 5-point satisfaction rating (and, only for low scores, an optional
 * reason) from someone who just tried the product, then forwards it to a Google
 * Apps Script Web App that appends one row to the target sheet. The same form
 * also asks — always optionally — whether they want to be told when we launch
 * and whether they'd join a short user interview; that 사전 신청 연락처는
 * 체험을 마친 사람에게만 묻는다 (랜딩에는 없다). 비워도 소감은 그대로
 * 접수된다. 단, 인터뷰 의향에 체크했다면 연락할 방법이 있어야 하므로
 * 연락처가 필수가 된다. The webhook URL and shared token live
 * only in server env vars.
 *
 * 이 파일은 최상단 `"use server"` 모듈이므로 **async 함수만** export한다.
 * `FeedbackState`·`initialFeedbackState`가 여기 있으면 Next가 상수까지 서버
 * 레퍼런스로 등록해 제출이 깨진다 — 이유는 `./feedback-state` 주석 참고.
 */

import type { FeedbackState } from "@/app/register/feedback-state";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** 구분자를 걷어낸 국내 번호 — 휴대폰(11자리)과 지역번호(9~10자리)를 함께 받는다. */
const PHONE_RE = /^0\d{8,10}$/;
const CONTACT_MAX = 254;

/**
 * 연락 수단은 이메일 또는 전화번호 중 하나면 된다. 어느 쪽으로 받을지는
 * 사용자가 고르는 것이지 우리가 강제할 일이 아니다. 브라우저 쪽 검사는
 * 우회될 수 있으므로 서버에서 한 번 더 본다.
 */
function isValidContact(value: string): boolean {
  if (EMAIL_RE.test(value)) return true;
  const digits = value.replace(/[\s().-]/g, "").replace(/^\+82/, "0");
  return PHONE_RE.test(digits);
}

/** 1–5 → human-readable label stored alongside the score. */
const RATING_LABELS: Record<number, string> = {
  1: "아쉬웠어요",
  2: "그저 그랬어요",
  3: "괜찮았어요",
  4: "좋았어요",
  5: "정말 좋았어요",
};

export async function submitFeedback(
  _prev: FeedbackState,
  formData: FormData,
): Promise<FeedbackState> {
  // Honeypot: real users never fill a hidden field. Pretend success so bots
  // get no signal, but skip the write.
  if (((formData.get("company") as string) || "").trim() !== "") {
    return { status: "success" };
  }

  // 사전 신청은 언제나 선택 — 적었을 때만 형식을 본다.
  const contact = ((formData.get("contact") as string) || "").trim();
  // 인터뷰 의향 — 체크박스라 체크했을 때만 "on"이 실려 온다.
  const interview = (formData.get("interview") as string) === "on";

  // 두 오류를 함께 돌려준다: 만족도에서 먼저 끊으면 잘못 적은 연락처를 한 번 더
  // 제출해야 알게 된다.
  const errors: NonNullable<FeedbackState["errors"]> = {};

  const ratingRaw = ((formData.get("rating") as string) || "").trim();
  const rating = Number(ratingRaw);
  if (!ratingRaw || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    errors.rating = "만족도를 선택해 주세요.";
  }
  // 인터뷰에 응하겠다는 분에게는 연락할 방법이 있어야 한다 — 이때만 연락처가
  // 필수로 승격된다. 클라이언트에서도 안내하지만 우회될 수 있으니 서버가 최종.
  if (interview && !contact) {
    errors.contact = "인터뷰 연락을 드리려면 이메일이나 휴대폰 번호가 필요해요.";
  } else if (
    contact &&
    (contact.length > CONTACT_MAX || !isValidContact(contact))
  ) {
    errors.contact = "이메일 주소나 휴대폰 번호를 다시 확인해 주세요.";
  }
  if (Object.keys(errors).length > 0) {
    return { status: "error", errors };
  }

  // Reason is only asked (and only meaningful) for low scores (1–3). The inputs
  // are unmounted for high scores, so nothing stale is submitted, but gate on
  // the score anyway. "기타" swaps in the free-text value.
  const reasonSel = ((formData.get("reason") as string) || "").trim();
  const reasonEtc = ((formData.get("reasonEtc") as string) || "").trim();
  const reason =
    rating <= 3 ? (reasonSel === "기타" ? reasonEtc : reasonSel) : "";

  // Optional free-form comment, always allowed regardless of the score.
  const comment = ((formData.get("comment") as string) || "").trim();

  const url = process.env.SHEETS_WEBHOOK_URL;
  const token = process.env.SHEETS_WEBHOOK_TOKEN;
  if (!url || !token) {
    console.error(
      "[feedback] SHEETS_WEBHOOK_URL / SHEETS_WEBHOOK_TOKEN 환경변수가 설정되지 않았습니다.",
    );
    return {
      status: "error",
      message: "일시적인 오류로 전송에 실패했어요. 잠시 후 다시 시도해 주세요.",
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        rating,
        ratingLabel: RATING_LABELS[rating] ?? "",
        reason,
        comment,
        contact,
        // 시트에서 바로 읽히게 문자열로 보낸다. Apps Script 쪽에도 이 필드를
        // 받는 열을 추가해야 기록된다.
        interview: interview ? "희망" : "",
      }),
      cache: "no-store",
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    const text = await res.text();
    let ok = false;
    try {
      ok = res.ok && JSON.parse(text)?.ok === true;
    } catch {
      ok = false;
    }
    if (!ok) {
      console.error(
        `[feedback] 웹훅 응답 오류 status=${res.status} body=${text.slice(0, 200)}`,
      );
      return {
        status: "error",
        message:
          "소감 전송에 실패했어요. 잠시 후 다시 시도하거나 문의해 주세요.",
      };
    }
  } catch (err) {
    console.error("[feedback] 웹훅 요청 실패", err);
    return {
      status: "error",
      message: "네트워크 오류로 전송에 실패했어요. 잠시 후 다시 시도해 주세요.",
    };
  }

  return {
    status: "success",
    subscribed: contact.length > 0,
    interviewRequested: interview,
  };
}
