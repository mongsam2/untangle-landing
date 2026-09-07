<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 에이전트 지침

## 답변 방식

- 모든 답변은 결론, 결과 또는 권장안처럼 사용자에게 가장 중요한 내용부터 제시한다.
- 답변의 첫 부분은 핵심을 빠르게 파악할 수 있도록 간결하게 작성한다.
- 제안·비교·검토에서는 권장안과 핵심 판단 근거를 먼저 제시한 뒤 세부 사항을 중요도순으로 설명한다.
- 업무 진행 상황이나 결과를 보고할 때는 현재 상태 또는 성과를 먼저 제시하고, 수행한 내용과 남은 사항을 중요도순으로 설명한다.

# 개발 가이드라인

이 문서는 Next.js App Router와 TypeScript를 사용하는 이 프로젝트에 적용하는 개발 지침이다.

## 0. 문서 구성

### 0.1 개발 가이드라인의 상시 규칙

1. [프로젝트 구조](#1-프로젝트-구조) — 레이어 역할과 의존 방향, 이름 규칙
2. [TypeScript 코드 스타일](#2-typescript-코드-스타일) — 주석, 린터와 포매터 실행과 검증 기준
3. [작업 완료 전 확인](#3-작업-완료-전-확인) — 검증 명령과 실패 처리
4. [커밋 전 사용자 검토](#4-커밋-전-사용자-검토) — 커밋 생성 전 승인 절차

### 0.2 상황별로 읽는 규약 문서

특정 시점에만 필요한 절차 지침은 `docs/conventions/`에 두고 그 시점에 읽는다.
아래 상황에서는 **작업을 시작하기 전에 해당 문서를 읽고 그대로 따른다.**

지침 문서의 의존 방향은 `AGENTS.md`에서 상황별 규약 문서로만 향하게 유지한다.
`docs/`의 지침 문서는 `AGENTS.md`를 참조하지 않으며, 필요한 경우 `docs/` 안의
다른 지침 문서만 참조한다.

| 상황                                                                    | 문서                                                                     |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `docs/` 문서를 작성·수정·삭제할 때                                      | [`docs/conventions/documentation.md`](docs/conventions/documentation.md) |
| 브랜치를 만들 때, GitHub 이슈를 작성·수정할 때, 커밋할 때, PR을 올릴 때 | [`docs/conventions/git.md`](docs/conventions/git.md)                     |

## 1. 프로젝트 구조

이 프로젝트는 Next.js 16.2.10을 사용한다. 문서 첫머리의 경고대로 이 버전은
학습 데이터에 있는 Next.js와 다르므로, 코드를 작성하기 전에
`node_modules/next/dist/docs/`에서 해당 기능의 문서를 읽는다.

Next.js는 프로젝트 구조를 강제하지 않는다. 이 프로젝트는 `app/`을 라우팅
용도로만 사용하고 나머지 코드를 저장소 루트의 디렉터리에 두는 방식을 따르며,
새로 추가하는 코드도 이 방식을 유지한다.

### 1.1 레이어와 역할

| 위치                 | 역할                                                    |
| -------------------- | ------------------------------------------------------- |
| `app/layout.tsx`     | 모든 라우트를 감싸는 루트 레이아웃                      |
| `app/**/page.tsx`    | 라우트 진입점. 별도 표시가 없으면 서버 컴포넌트다       |
| `app/**/route.ts`    | HTTP 엔드포인트 (Route Handler)                         |
| `app/**/actions.ts`  | 서버 함수(`"use server"`). 폼 제출과 데이터 변경 진입점 |
| `app/**/error.tsx`   | 라우트 단위 오류 경계                                   |
| `app/globals.css`    | 전역 스타일과 디자인 토큰                               |
| `sections/`          | 랜딩 페이지를 이루는 큰 단위 블록                       |
| `components/`        | 여러 화면에서 재사용하는 UI 컴포넌트                    |
| `components/<기능>/` | 한 기능에 속하는 컴포넌트와 상태, 타입                  |
| `lib/`               | UI에 의존하지 않는 로직과 외부 서비스 클라이언트        |
| `public/`            | 정적 자산                                               |

```text
app/
├── layout.tsx
├── page.tsx
├── globals.css
├── api/
│   ├── braindump/route.ts
│   └── split/route.ts
├── demo/
│   └── page.tsx
└── register/
    ├── page.tsx
    ├── actions.ts
    ├── error.tsx
    ├── feedback-state.ts
    └── RegisterForm.tsx

sections/
├── Header.tsx
├── Hero.tsx
└── Problem.tsx

components/
├── CtaButton.tsx
├── Icon.tsx
├── analytics/
├── demo/
│   ├── DemoFlow.tsx
│   ├── state.ts
│   └── types.ts
└── split/

lib/
├── analytics.ts
├── llm.ts
└── site.ts
```

한 라우트에서만 사용하는 컴포넌트는 그 라우트 세그먼트 안에 함께 둔다
(`app/register/RegisterForm.tsx`). 세그먼트 안의 파일은 `page.tsx`나 `route.ts`가
아닌 한 URL로 노출되지 않는다.

### 1.2 의존 방향

```
app(page / route / actions) → sections → components → lib

lib : 다른 레이어를 참조하지 않는다.
      React 컴포넌트를 import 하지 않으며, 브라우저 전용 API에 의존하지 않는다.
```

- **의존 방향이 어긋나는 코드는 절대 작성하지 않는다.**
- `components`는 `sections`와 `app`을 참조하지 않고, `sections`는 `app`을 참조하지 않는다.
- 라우트 세그먼트 안에 둔 컴포넌트를 두 곳 이상에서 사용하게 되면 `components/`로 옮긴다.
- 상태 관리 라이브러리를 따로 두지 않는다. React의 `useState`와 `useReducer`가 이미 그 역할을 하며, 한 겹 더 감싸면 상태가 갱신되는 위치만 흐려진다.
- 다른 컴포넌트를 한 번 더 감싸기만 하는 컴포넌트를 만들지 않는다. props를 그대로 전달하기만 한다면 감싸인 컴포넌트를 직접 사용한다.

### 1.3 데이터 흐름과 책임

```
요청 → page.tsx    : 서버에서 렌더링한다. 비밀 값을 다루고 데이터를 조회한다
     → 클라이언트 컴포넌트 : 상태와 이벤트를 처리한다
     → actions.ts / route.ts : 서버에서 데이터를 변경하거나 외부 API를 호출한다
     → lib          : 업무 규칙을 판단하고 외부 서비스를 호출한다
```

- **서버와 클라이언트 경계**: 기본은 서버 컴포넌트다. 상태, 이벤트 핸들러, 생명주기 훅, 브라우저 전용 API, 커스텀 훅이 필요할 때만 클라이언트 컴포넌트로 만든다. `"use client"`는 화면 전체가 아니라 상호작용이 필요한 최말단 컴포넌트에 붙여서 브라우저로 보내는 JavaScript를 줄인다.
- **진입점 선택**: 폼 제출과 데이터 변경은 서버 함수(`actions.ts`)를 사용한다. 브라우저에서 `fetch`로 직접 호출해야 하거나 외부에 공개할 엔드포인트가 필요할 때만 Route Handler(`route.ts`)를 만든다.
- **입력 검증**: 서버 함수는 화면을 거치지 않고 POST 요청으로 직접 호출될 수 있다. 그러므로 모든 서버 함수와 Route Handler 안에서 입력값을 다시 검증한다. 클라이언트에서 수행한 검증은 사용자 편의를 위한 장치이며 신뢰 근거가 되지 못한다.
- **비밀 값**: API 키와 토큰은 서버에서만 읽는다. `NEXT_PUBLIC_` 접두어가 붙은 환경 변수는 브라우저로 전달되므로 비밀 값에 사용하지 않는다.
- **오류 처리**: 렌더링 중 발생한 오류는 해당 라우트의 `error.tsx`가 받는다. Route Handler는 상태 코드와 본문 형식을 정해서 응답한다.
- **진입점 공유**: 같은 로직을 서버 함수와 Route Handler 중 둘 이상에서 사용하면 반드시 `lib/`의 함수로 두고 각 진입점이 그것을 호출한다.
- **외부 서비스 호출**: 외부 SDK 호출은 `lib/`에 둔다. Route Handler에서 SDK를 직접 호출하지 않는다.

`lib/llm.ts`:

```ts
/**
 * LLM 공급자를 결정한다.
 * 요청에 담긴 값, 환경 변수, 키 보유 여부 순으로 판단한다.
 */

/** 사용할 공급자를 고르고, 키가 없으면 안내 문구를 돌려준다. */
export function resolveProvider(
  requested?: Provider,
): { provider: Provider } | { error: string } {
  // ...
}
```

`app/api/split/route.ts`:

```ts
/**
 * 쪼개기 요청을 받아 LLM 응답을 돌려주는 엔드포인트.
 *
 * 브라우저에서 직접 호출하므로 서버 함수가 아니라 Route Handler로 둔다.
 */

import { resolveProvider } from "@/lib/llm";

export async function POST(request: Request) {
  const body = await request.json();
  const resolved = resolveProvider(body.provider);
  if ("error" in resolved) {
    return Response.json({ error: resolved.error }, { status: 400 });
  }
  // ...
}
```

### 1.4 파일 이름 규칙

| 위치              | 규칙                                              | 예                                                |
| ----------------- | ------------------------------------------------- | ------------------------------------------------- |
| 라우트 디렉터리   | 소문자와 하이픈                                   | `app/register/`, `app/demo/`                      |
| Next.js 예약 파일 | 규약 이름 고정                                    | `page.tsx`, `layout.tsx`, `error.tsx`, `route.ts` |
| 컴포넌트 파일     | 파스칼 표기법. 파일 이름과 내보내는 이름을 맞춘다 | `CtaButton.tsx`                                   |
| 훅 파일           | `use`로 시작하는 카멜 표기법                      | `useSplitFlow.ts`                                 |
| 상태·타입 모듈    | 소문자 고정 이름                                  | `state.ts`, `types.ts`                            |
| `lib/` 모듈       | 소문자                                            | `analytics.ts`, `llm.ts`                          |

- 기능 단위 컴포넌트는 `components/<기능>/`에 모으고, 그 기능의 타입은 `types.ts`에, 상태 관리는 `state.ts`에 둔다.
- 모듈 이름을 임의로 만들지 않는다. 새 이름이 필요해 보이면 기존 모듈로 설명되지 않는지 먼저 확인한다.
- 파일이 커지면 쪼개지 말고 같은 이름의 디렉터리로 승격한다: `lib/llm.ts` → `lib/llm/`
- URL에 드러나지 않게 라우트를 묶을 때는 `(그룹명)` 형식의 라우트 그룹을 사용한다. 디렉터리를 새로 만들어 URL 구조를 바꾸지 않는다.

### 1.5 새 기능 추가 순서

1. `types.ts` — 주고받을 데이터의 타입을 정의한다
2. `lib/` — 업무 규칙과 외부 서비스 호출을 구현한다
3. `route.ts` 또는 `actions.ts` — 서버 진입점을 만든다
4. `components/` — 화면을 구성하는 컴포넌트를 만든다
5. `sections/` 또는 `app/**/page.tsx` — 페이지에 배치한다
6. [작업 완료 전 확인](#3-작업-완료-전-확인)을 실행한다

로직이 거의 없어 보여도 3번에서 2번을 건너뛰지 않는다.

## 2. TypeScript 코드 스타일

### 2.1 주석

- 직접 작성하는 모듈은 그 파일이 무엇을 담당하는지 설명하는 블록 주석으로 시작한다. 지시어와 import 아래, 첫 선언 앞에 둔다.
- 파일 설명 블록은 한국어로 작성하고 여섯 줄을 넘기지 않으며, **코드에서 이미 명확한 동작을 그대로 반복하지 않는다.**
- 아래 다섯 지점에서는 왜 그렇게 작성했는지를 반드시 주석으로 남긴다. 프레임워크가 강제하는 제약은 코드만 읽어서는 드러나지 않는다.

| 지점                                          | 적어야 하는 내용                           |
| --------------------------------------------- | ------------------------------------------ |
| `"use client"`                                | 서버 컴포넌트로 둘 수 없는 이유            |
| `"use server"` 모듈                           | 그 파일에 걸리는 제약                      |
| `useEffect`, `useRef`                         | 렌더링 중이 아니라 이 시점이어야 하는 이유 |
| Route Handler와 서버 함수 중 하나를 고른 자리 | 그 진입점을 고른 이유                      |
| `memo`, `dynamic`, 캐시 설정                  | 무엇을 막으려는 최적화인지                 |

- `lib/`이 내보내는 함수와 커스텀 훅에는 한 줄짜리 JSDoc을 붙인다. 컴포넌트는 props 타입이 그 역할을 하므로 붙이지 않는다.
- 그 밖의 설명용 주석은 원칙적으로 작성하지 않는다.
- **코드만으로 파악하기 어려운 제약, 설계 결정, 예외 처리 또는 우회 방식의 이유를 협업자에게 알려야 할 때만 주석을 허용한다. 이때 코드가 무엇을 하는지가 아니라 왜 그렇게 작성했는지를 설명한다.**
- Tailwind 클래스를 나열한 자리에는 주석을 달지 않는다. 코드가 곧 결과이므로 주석이 금방 낡는다. 같은 조합이 반복되면 주석 대신 컴포넌트로 승격한다.
- **주석에 문서 경로를 적지 않는다.** 문서를 옮기거나 삭제하면 주석이 조용히 낡는다. 연결이 필요하면 문서에서 코드를 가리킨다.
- 이 변경이 왜 필요했는지에 해당하는 설명은 커밋 본문에 적고, 주석에는 앞으로 코드를 읽을 때마다 필요한 설명만 남긴다.
- `next-env.d.ts`처럼 자동으로 생성되는 파일은 파일 설명 블록의 대상에서 제외한다.

### 2.2 린터 및 포매터

- 포매터로 Prettier를, 린터로 ESLint를 사용한다.
- 코드 변경 후 `bun run format`으로 포맷을 적용한다.
- 작업 완료 전 `bun run lint`를 실행하고 모든 린트 오류를 해결한다.
- 린트 규칙을 무시하는 `eslint-disable` 주석과 `eslint.config.mjs`의 제외 설정은 사용자 확인 없이 추가하지 않는다.
- 타입 오류를 `any`나 `@ts-expect-error`로 덮지 않는다. `tsconfig.json`의 `strict` 설정도 사용자 확인 없이 완화하지 않는다.

## 3. 작업 완료 전 확인

- 작업을 마치기 전에 아래 네 명령을 순서대로 실행하고 모두 통과시킨다.

```bash
bun run format
bun run lint
bun run typecheck
bun run build
```

- 실패한 검사를 검사 대상에서 제외하거나 설정을 완화해 통과시키는 대신, 원인을 확인해 코드를 수정한다.
- 화면이 바뀌는 변경은 `bun run dev`로 실제 화면을 확인한다.

## 4. 커밋 전 사용자 검토

- **커밋을 생성하기 전에 커밋 제목과 본문을 사용자에게 보여주고 검토를 받는다.** 사용자가 승인하기 전에는 `git commit`을 실행하지 않는다.
- 사용자가 수정을 요청하면 반영한 내용을 다시 보여주고 승인을 받은 뒤 커밋한다.
- **한 번의 요청에서 커밋을 여러 개 만들 때도 예외 없이 적용한다.**
  - 커밋을 나눈 기준, 커밋별로 포함되는 파일, 각 커밋의 제목과 본문을 순서대로 한 번에 보여주고 검토를 받는다.
  - 승인받은 내용 그대로, 보여준 순서대로 커밋을 생성한다.
  - 검토 중 커밋 구성이 바뀌면 바뀐 전체 구성을 다시 보여주고 승인을 받는다.

```
커밋 2개로 나눠 만들려고 합니다. 검토 부탁드립니다.

[1/2] lib/llm.ts, app/api/split/route.ts
feat: 쪼개기 요청에 공급자 선택 옵션 추가

- 요청 본문의 `provider` 값으로 사용할 LLM을 고른다
- 키가 없는 공급자를 고르면 400으로 응답한다

[2/2] components/split/useSplitFlow.ts, components/split/OptionChips.tsx
feat: 쪼개기 화면에서 공급자를 고르는 UI 추가

- 화면 상단에서 공급자를 전환한다
- 전환한 값을 요청 본문에 함께 보낸다
```
