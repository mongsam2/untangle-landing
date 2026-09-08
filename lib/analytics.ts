/**
 * 사용자 행동 로그의 유일한 진입점 (얇은 래퍼).
 *
 * 나머지 코드는 posthog-js를 직접 import하지 않고 이 모듈의 track()/page()만
 * 호출한다 — 나중에 백엔드를 바꾸거나(no-op) 교체하기 쉽도록 seam을 둔다.
 *
 * 개인정보 원칙(중요): 브레인덤프 원문·후보/태스크/카드 제목 등 "사용자 콘텐츠"는
 * 절대 넘기지 않는다. props에는 메타데이터(길이·개수·인덱스·소요시간 등)만 담는다.
 * autocapture를 꺼서 입력값이 실수로 수집되는 것도 원천 차단한다.
 */

import posthog from "posthog-js";

/** Phase 1 핵심 퍼널 이벤트. Phase 2에서 세밀 이벤트를 이 union에 추가한다. */
export type AnalyticsEvent =
  | "section_viewed" // 랜딩 섹션 스크롤 도달
  | "cta_clicked" // 랜딩 → 데모 진입 CTA
  | "demo_phase_view" // 데모 단계 전환(퍼널 골격)
  | "braindump_submitted" // 브레인덤프 전송(글자수만)
  | "candidates_confirmed" // 후보 확정(개수만)
  | "split_confirmed" // 쪼개기 계획 확정(태스크 수만)
  | "first_check_success" // 오늘 화면 첫 체크(성공 신호)
  | "demo_cta_clicked" // 데모 → 소감 CTA(표면별)
  | "feedback_submitted"; // 소감 제출(평점·연락처 유무만)

export type AnalyticsProps = Record<
  string,
  string | number | boolean | undefined
>;

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
// 미국 호스트 고정 — 필요 시 .env.local 에서 override.
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

let started = false;

/** 최초 1회 초기화. 키가 없으면 조용히 no-op → 로컬/미설정 환경에서도 안전. */
export function initAnalytics(): void {
  if (started || typeof window === "undefined" || !KEY) return;
  started = true;
  posthog.init(KEY, {
    api_host: HOST,
    // 영속 익명 ID를 localStorage에만 둔다 → 쿠키 없음, 재방문 추적 가능.
    persistence: "localStorage",
    // 입력값·클릭을 자동 수집하지 않는다 — 개인 콘텐츠 유출 차단. 명시 이벤트만.
    autocapture: false,
    // App Router는 라우트 전환마다 수동으로 $pageview 를 쏜다(Pageviews 컴포넌트).
    capture_pageview: false,
    // 이탈 시점을 남겨 퍼널 드롭오프 계산에 쓴다.
    capture_pageleave: true,
    // 세션 리플레이 켜짐 — 단, 개인 콘텐츠 보호를 위해 모든 입력값과 화면 텍스트를
    // 마스킹한다. 재생 화면에는 레이아웃·클릭·스크롤·이동만 남고, 브레인덤프·할 일·
    // 연락처 같은 실제 내용은 별표로 가려진다. 네트워크 요청 본문은 녹화하지 않는다
    // (기본값). 실제 녹화는 PostHog 프로젝트 설정에서 Session Replay를 켜야 시작된다.
    disable_session_recording: false,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "*",
    },
    // identify()를 부르지 않으므로 person profile 없이 익명 이벤트로만 남긴다.
    person_profiles: "identified_only",
  });
}

export function isAnalyticsReady(): boolean {
  return started;
}

/** 이름 붙은 이벤트 1건 기록. 초기화 전/서버에서는 no-op. */
export function track(event: AnalyticsEvent, props?: AnalyticsProps): void {
  if (typeof window === "undefined" || !started) return;
  posthog.capture(event, props);
}

/** App Router 라우트 전환 시 페이지뷰 기록. */
export function capturePageview(url: string): void {
  if (typeof window === "undefined" || !started) return;
  posthog.capture("$pageview", { $current_url: url });
}
