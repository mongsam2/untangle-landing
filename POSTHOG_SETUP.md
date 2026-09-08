# PostHog 연동 — 프로젝트/키 발급과 확인 절차

> 요약: 랜딩·데모 사용자 행동 로그(PostHog) 프로젝트 생성, 키 발급, 환경변수 주입, 이벤트 확인, 퍼널 구성 절차 — 분석을 켜거나 점검할 때 읽으세요.

랜딩·데모 계측 코드는 이미 들어가 있습니다(Phase 1). **키가 없으면 분석은 조용히 꺼진 채로 앱은 그대로 동작**하므로, 아래 절차로 키만 주입하면 바로 수집이 시작됩니다.

호스트는 **미국 클라우드**로 진행합니다.

---

## 1. PostHog 프로젝트 만들기

1. https://us.posthog.com 에서 가입합니다(**미국 클라우드**. EU 주소인 `eu.posthog.com`이 아니어야 합니다).
2. 안내에 따라 Organization과 Project를 하나 만듭니다. Product는 "Product analytics"면 충분합니다.
3. 온보딩에서 설치 스니펫을 물어보면 건너뜁니다 — 코드는 이미 `posthog-js`로 연동돼 있습니다.

## 2. 키·호스트 확인

- **Settings → Project → General**(또는 온보딩 화면)에서 **Project API Key**를 복사합니다. `phc_`로 시작하는 값입니다.
- 이 키는 **브라우저에 노출되는 공개용(publishable) 키**입니다. 노출되어도 정상이며(그래서 `NEXT_PUBLIC_` 접두사를 씁니다), 데이터를 읽어오는 키가 아니라 이벤트를 보내기만 하는 키입니다.
- **Host**는 `https://us.i.posthog.com` 입니다(앱 주소 `us.posthog.com`이 아니라 수집 엔드포인트 `us.i.posthog.com`).
- ⚠️ Personal API Key(개인 키)와 헷갈리지 마세요. 우리가 쓰는 건 **Project API Key** 하나뿐입니다.

## 3. 환경변수 주입

### 로컬(.env.local)

`.env.local`에 아래 두 줄을 추가하고 `bun run dev`를 재시작합니다:

```
NEXT_PUBLIC_POSTHOG_KEY=phc_여기에_붙여넣기
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

(`NEXT_PUBLIC_POSTHOG_HOST`는 생략해도 코드가 `https://us.i.posthog.com`로 기본 설정합니다. 명시해두면 헷갈릴 일이 없습니다.)

### 배포(Vercel)

Vercel → 프로젝트 → **Settings → Environment Variables**에서 위 두 변수를 **Production·Preview**에 추가한 뒤 재배포합니다. `NEXT_PUBLIC_` 변수는 빌드 시점에 번들로 구워지므로 **값 변경 후 반드시 재배포**해야 반영됩니다.

## 4. 잘 들어오는지 확인

1. 로컬/배포 사이트를 열고 랜딩을 끝까지 스크롤 → 데모 진입 → 브레인덤프 제출 → 오늘 화면 체크 → 소감 제출까지 한 바퀴 돌립니다.
2. PostHog → **Activity**(또는 좌측 **Activity → Live events**)에서 아래 이벤트가 실시간으로 뜨는지 봅니다: `section_viewed`, `cta_clicked`, `$pageview`, `demo_phase_view`, `braindump_submitted`, `candidates_confirmed`, `split_confirmed`, `first_check_success`, `demo_cta_clicked`, `feedback_submitted`.
3. **개인정보 게이트 점검(중요):** 아무 이벤트나 열어 properties를 확인해, **브레인덤프 원문이나 할 일 제목 같은 텍스트가 절대 담기지 않는지** 확인합니다. 담기는 건 길이·개수·표면 이름 같은 메타데이터뿐이어야 합니다.
4. 같은 브라우저에서 낸 이벤트들이 **하나의 `distinct_id`**(localStorage에 저장된 익명 식별자)로 묶이는지 확인합니다.

## 5. 두 가지 핵심 질문에 답하는 퍼널 만들기

PostHog 좌측 **Product analytics → New insight → Funnel**에서:

### 퍼널 A — "랜딩이 데모까지 이끄는가" (목표 1)

1. `$pageview` (필터: Current URL = 랜딩 `/`)
2. `section_viewed` (필터: `section` = `finalcta`) — 끝까지 읽은 비율
3. `cta_clicked` — CTA를 누른 비율
4. `$pageview` (필터: Current URL 에 `/demo` 포함) — 실제 데모 진입

→ 단계별 전환/이탈률로 **어느 섹션에서 흥미를 잃는지, CTA가 얼마나 눌리는지, 랜딩→데모 전환율**을 봅니다. `cta_clicked`를 `location`으로 쪼개면 hero/finalcta/header 중 어디가 효과적인지도 나옵니다.

### 퍼널 B — "데모를 어디까지 쓰고 그만두나" (목표 2)

1. `demo_phase_view` (필터: `phase` = `braindump`)
2. `demo_phase_view` (필터: `phase` = `candidates`)
3. `demo_phase_view` (필터: `phase` = `split`)
4. `demo_phase_view` (필터: `phase` = `today`)
5. `first_check_success`
6. `feedback_submitted`

→ 단계별 드롭오프로 **어느 단계에서 이탈하는지**를 봅니다. PostHog 퍼널의 "time to convert"로 단계별 체류시간도 나옵니다.

### 만족도 × 퍼널 깊이 상관

- `feedback_submitted`를 `rating`으로 breakdown 한 Trends, 또는 퍼널 B의 마지막 단계를 `rating`으로 나눠 보면 **깊이 간 사람일수록 만족도가 높은지** 확인할 수 있습니다.

## 6. 참고: 이벤트 사전 (Phase 1)

| 이벤트                 | 언제                              | properties(콘텐츠 없음)                                  |
| ---------------------- | --------------------------------- | -------------------------------------------------------- |
| `$pageview`            | 라우트 전환마다                   | `$current_url`                                           |
| `section_viewed`       | 랜딩 섹션이 화면에 들어올 때(1회) | `section` (hero/problem/differentiation/whofor/finalcta) |
| `cta_clicked`          | 랜딩 데모 CTA 클릭                | `location` (hero/finalcta/header)                        |
| `demo_phase_view`      | 데모 단계 진입/전환               | `phase` (braindump/candidates/split/today)               |
| `braindump_submitted`  | 브레인덤프 전송                   | `length` (글자 수)                                       |
| `candidates_confirmed` | 후보 확정                         | `count`                                                  |
| `split_confirmed`      | 쪼개기 계획 확정                  | `task_count`, `has_first_step`                           |
| `first_check_success`  | 오늘 화면 첫 체크                 | —                                                        |
| `demo_cta_clicked`     | 데모 → 소감 CTA 클릭              | `surface` (all_done/slideup/minibar)                     |
| `feedback_submitted`   | 소감 제출 성공                    | `rating`, `has_contact`, `subscribed`                    |

## 7. 개인정보 관련 (반영 완료)

- 수집 설정: **쿠키 없음**(localStorage에 익명 식별자만), **autocapture 꺼짐**, **세션 리플레이 켜짐(전체 마스킹 — 입력값·화면 텍스트를 모두 가림)**, 페이지뷰 수동, 익명(`identify` 미사용).
- **세션 리플레이 활성화:** SDK에는 마스킹과 함께 켜뒀지만(`lib/analytics.ts`의 `disable_session_recording: false` + `session_recording` 마스킹), **PostHog → Settings → Session Replay 에서 "Record user sessions"를 켜야** 실제 녹화가 시작됩니다. 마스킹 덕분에 재생 화면에는 레이아웃·클릭·스크롤·이동만 보이고 브레인덤프·할 일·연락처 같은 텍스트는 별표로 가려집니다. (네트워크 요청 본문 녹화는 켜지 마세요 — API 요청에 원문이 담깁니다.) 확인 시 녹화 하나를 열어 **텍스트가 실제로 가려졌는지** 반드시 검증하세요.
- `app/privacy/page.tsx`의 처리방침을 이에 맞게 개정했고(1·4·7항 + 시행일), 수탁사에 **PostHog Inc.(미국)**을 명시했습니다. 방침 문안은 필요하면 더 다듬으세요.
- 원칙: **적으신 내용 자체(브레인덤프·할 일 제목)는 어떤 이벤트에도 담지 않습니다.** 새 이벤트를 추가할 때도 이 원칙을 지켜주세요(`lib/analytics.ts` 상단 주석 참고).

## 8. 코드에서 손댈 곳

- 초기화 설정: `lib/analytics.ts` (`initAnalytics`)
- 이벤트 추가/수정: `lib/analytics.ts`의 `AnalyticsEvent` union에 이름을 추가하고, 해당 지점에서 `track(name, props)` 호출.
- 계측 지점: `components/analytics/*`(provider·pageview·LandingTracker·TrackedLink), `components/CtaButton.tsx`, `sections/*`, `components/demo/DemoFlow.tsx`·`BraindumpPhase.tsx`·`TodayPhase.tsx`, `app/register/RegisterForm.tsx`.

Phase 2(세밀 행동 이벤트 + 서버측 LLM 지연/에러 로깅)는 아직 미구현입니다.
