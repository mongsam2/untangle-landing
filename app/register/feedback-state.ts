/**
 * Shape of the `/register` feedback form's action state.
 *
 * 이 파일에 `"use server"`를 붙이면 안 된다. 파일 최상단 `"use server"` 모듈은
 * **async 함수만** export할 수 있는데, Next는 그 규칙을 어긴 export를 빌드 에러로
 * 막는 대신 **조용히 서버 레퍼런스로 등록해 버린다**. 그러면 클라이언트가 import한
 * `initialFeedbackState`는 `{ status: "idle" }` 객체가 아니라
 * `createServerReference(...)`가 만든 함수 프록시가 되고, `useActionState`의 초기
 * 상태로 실려 제출 시 서버로 되돌아가면서 액션 요청이 서버에서 터진다
 * (에러 경계가 없으면 페이지 전체가 Next 기본 500 화면으로 바뀐다).
 * 그래서 타입과 상수는 디렉티브 없는 이 모듈에 두고, `actions.ts`는
 * `submitFeedback` 하나만 export한다.
 */

export type FeedbackState = {
  status: "idle" | "success" | "error";
  message?: string;
  errors?: { rating?: string; contact?: string };
  /** 성공 시 사전 신청까지 남겼는지 — 완료 문구를 가르는 데만 쓴다. */
  subscribed?: boolean;
  /** 성공 시 인터뷰 의향까지 남겼는지 — 완료 문구와 로그에만 쓴다. */
  interviewRequested?: boolean;
};

export const initialFeedbackState: FeedbackState = { status: "idle" };
