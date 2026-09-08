<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# 에이전트 지침

Next.js 16 App Router와 TypeScript로 만든 Untangle 랜딩이다. 데모의 AI 응답은 별도
저장소인 `untangle-ai` 서버가 만들고, 이 저장소는 브라우저 요청을 그 서버로 전달한다.

`CLAUDE.md`는 이 문서를 불러오기만 한다. 규칙은 이 문서에만 적는다.

## 1. 답변 방식

- 결론, 결과 또는 권장안처럼 사용자에게 가장 중요한 내용을 먼저 제시한다.
- 세부 사항은 그 뒤에 중요도순으로 설명한다.

## 2. 작업을 시작하기 전에 읽을 규약

아래 상황에 해당하면 **그 문서를 먼저 읽고 그대로 따른다.** 요약이나 기억에 의존하지
않고 매번 파일을 직접 읽는다. 읽지 않았다면 그 작업을 시작하지 않는다.

| 상황                                                                                                      | 문서                                                                     |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 파일·디렉터리를 만들거나 옮길 때, 이름을 정할 때, 새 기능을 넣을 때, 진입점이나 클라이언트 경계를 정할 때 | [`docs/conventions/architecture.md`](docs/conventions/architecture.md)   |
| `.ts`·`.tsx` 내용을 쓰거나 고칠 때                                                                        | [`docs/conventions/typescript.md`](docs/conventions/typescript.md)       |
| 브랜치를 만들 때, 커밋할 때, PR을 올릴 때, GitHub 이슈를 쓸 때                                            | [`docs/conventions/git.md`](docs/conventions/git.md)                     |
| `docs/` 문서나 README, 스펙을 만들거나 고치거나 지울 때                                                   | [`docs/conventions/documentation.md`](docs/conventions/documentation.md) |

## 3. 어겨서는 안 되는 것

되돌리기 어렵거나 배포 후에야 드러나는 것들이다. 규약 문서를 읽지 않은 상태에서도
지킨다.

### 3.1 사용자 승인 없이 하지 않는다

- **커밋을 만들기 전에 제목과 본문을 사용자에게 보여주고 승인을 받는다.** 커밋을 여러
  개 만들 때는 나눈 기준과 커밋별 파일, 제목과 본문을 한 번에 보여준다.
- `eslint-disable` 주석, ESLint 제외 설정, `any`, `@ts-expect-error`, `strict` 완화를
  새로 넣지 않는다.
- 검사가 실패하면 검사 대상에서 빼거나 설정을 완화하지 말고 원인을 고친다.

### 3.2 경계에서 지킨다

- 의존 방향은 `app → sections → components → lib`이다. `lib/`은 다른 레이어를 참조하지
  않고 React와 브라우저 전용 API에 의존하지 않는다.
- 서버 함수와 Route Handler 안에서 입력값을 다시 검증한다. 클라이언트 검증은 신뢰
  근거가 되지 못한다.
- API 키와 토큰은 서버에서만 읽는다. `NEXT_PUBLIC_` 접두어가 붙은 값은 브라우저로
  전달되므로 비밀 값에 쓰지 않는다.

### 3.3 주석으로 이유를 남긴다

파일 설명 블록은 **지시어와 import 아래, 첫 선언 앞**에 둔다. 아래 다섯 자리에는 왜
그렇게 했는지를 반드시 적는다. 자세한 기준은 `typescript.md`에 있다.

`"use client"` · `"use server"` 모듈 · `useEffect`와 `useRef` · Route Handler와 서버
함수 중 하나를 고른 자리 · `memo`와 `dynamic`과 캐시 설정

### 3.4 작업을 마치기 전에 검사한다

```bash
bun run format
bun run lint
bun run typecheck
bun run test
bun run build
```

화면이 바뀌는 변경은 `bun run dev`로 실제 화면을 확인한다. 개발 서버는 `localhost`로
접속한다. `127.0.0.1`로 열면 Next.js가 개발 리소스를 교차 출처로 막아 화면이
하이드레이션되지 않는다.

## 4. 이 문서를 고치는 기준

- 같은 실수가 두 번 반복되면 그 교정을 여기나 규약 문서에 넣는다.
- **규칙으로 쓰기 전에 린트·타입·테스트로 막을 수 있는지 먼저 확인한다.** 막을 수
  있으면 문서 대신 검사를 추가한다.
- **자동 검사가 그 실수를 막게 되면 대응하는 문서 규칙을 지운다.**
- 프로젝트 파일의 디렉터리 목록과 코드 예시를 문서에 적지 않는다. 사본은 원본보다 먼저
  낡고, 낡은 사본은 잘못된 방식을 가르친다.
- 이 문서는 130줄을 넘지 않는다. 넘으면 규약 문서로 내린다.
