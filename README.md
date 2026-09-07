# Untangle 랜딩

Next.js App Router로 만든 Untangle 랜딩과 `/demo` 체험 화면입니다. 데모의 AI 응답은
별도 저장소인 `untangle-ai` 서버가 만들고, 이 저장소의 Next.js 서버는 브라우저 요청을
그 서버로 전달하는 얇은 경계만 담당합니다.

## 로컬에서 실행하기

### 1. AI 서버를 먼저 띄웁니다

`/demo`의 대화는 `POST /api/chat` → `{UNTANGLE_AI_BASE_URL}/v1/chat` 으로 이어지므로,
AI 서버가 떠 있지 않으면 데모가 답을 받지 못합니다. `untangle-ai` 저장소의 실행 안내를
따라 서버를 먼저 시작하세요.

### 2. 환경 변수를 채웁니다

`.env.example`을 `.env.local`로 복사한 뒤 값을 넣습니다.

| 변수                   | 설명                                                           |
| ---------------------- | -------------------------------------------------------------- |
| `UNTANGLE_AI_BASE_URL` | AI 서버 주소. 비워두면 `http://127.0.0.1:8000`을 사용합니다.   |
| `SHEETS_WEBHOOK_URL`   | 체험 소감을 저장할 Apps Script 웹 앱 URL (아래 연동 절차 참고) |
| `SHEETS_WEBHOOK_TOKEN` | Apps Script 코드의 `TOKEN`과 같은 값                           |

`UNTANGLE_AI_BASE_URL`은 `NEXT_PUBLIC_` 접두사가 없는 서버 전용 값입니다. 브라우저는 AI
서버 주소와 공급자 설정을 알지 못합니다.

### 3. 랜딩 개발 서버를 띄웁니다

```bash
bun run dev
```

[http://localhost:3000](http://localhost:3000)을 엽니다. 개발 서버는 `localhost`로
접속해야 합니다. `127.0.0.1`로 열면 Next.js가 개발 리소스 요청을 교차 출처로 보고
차단해 화면이 하이드레이션되지 않습니다.

### 검증 명령

```bash
bun run format
bun run lint
bun run typecheck
bun run test
bun run build
```

## 데이터가 저장되는 위치

- **대화·할 일·완료 상태** — 이용자 브라우저의 `localStorage` 키 `untangle:demo:v2`에만
  남습니다. Next.js 서버는 대화와 할 일을 저장하지 않고 AI 서버로 전달만 합니다.
  완료 여부는 브라우저 전용 정보라 AI 요청에 넣지 않습니다.
- **체험 소감** — `/register` 폼 제출만 아래 Google 스프레드시트로 전송됩니다.

데모 안에는 저장된 내용을 지우는 버튼이 없습니다. 브라우저 설정에서 이 사이트의 데이터를
지우면 대화와 할 일이 함께 사라집니다.

## 체험 소감 저장 연동 (Google Sheets)

`/register`(체험 소감) 폼 제출은 서버 액션(`app/register/actions.ts`)을 거쳐 Google Apps
Script 웹 앱으로 전달되고, 지정한 스프레드시트에
`제출일시 · 만족도(점수) · 만족도 · 아쉬운 이유 · 자유 의견 · 사전 신청 연락처 · 인터뷰 참여 의향`
한 줄이 추가됩니다. 만족도는 1점부터 5점까지이며, 아쉬운 이유는 3점 이하일 때만 채워집니다.
자유 의견 · 사전 신청 연락처 · 인터뷰 참여 의향은 언제나 선택이라 비어 있을 수 있습니다.

연락처는 정식 출시 안내와 인터뷰 요청 연락을 마친 뒤 즉시 파기하기로 되어 있습니다
([개인정보 처리방침](app/privacy/page.tsx) 3절). 시트에 쌓인 연락처도 쓰임을 다한 뒤
직접 지워 주세요.

### 1. 시트에 헤더 행 만들기

1행에 다음 컬럼을 순서대로 입력합니다.

| 제출일시 | 만족도(점수) | 만족도 | 아쉬운 이유 | 자유 의견 | 사전 신청 연락처 | 인터뷰 참여 의향 |
| -------- | ------------ | ------ | ----------- | --------- | ---------------- | ---------------- |

> **사전 신청 연락처** 는 소감 폼에서 함께 받는 선택 항목이며, 이메일과 휴대폰 번호를 모두
> 받습니다. **인터뷰 참여 의향** 은 체크한 사람만 `희망` 이 들어오고 나머지는 빈 칸입니다.
> 체크하면 연락처가 필수가 되므로, `희망` 인 행에는 연락처가 항상 함께 있습니다.

### 2. Apps Script 웹 앱 배포

1. 시트에서 **확장 프로그램 → Apps Script** 를 엽니다.
2. 아래 코드를 붙여넣고 `TOKEN` 을 긴 랜덤 문자열로 바꿉니다.

   > **`SHEET_NAME` 주의** — 한국어 환경에서 만든 시트의 기본 탭 이름은 `Sheet1` 이 아니라
   > **`시트1`** 입니다. 이름이 어긋나면 `getSheetByName` 이 `null` 을 돌려주고
   > `TypeError: Cannot read properties of null (reading 'appendRow')` 로 실패합니다.
   > 아래 코드는 못 찾으면 첫 번째 탭으로 넘어가므로 이름이 무엇이든 동작합니다.

   ```javascript
   const TOKEN = "PUT_A_LONG_RANDOM_STRING_HERE";
   const SHEET_NAME = "시트1";

   function doPost(e) {
     try {
       const body = JSON.parse(e.postData.contents);
       if (body.token !== TOKEN)
         return json({ ok: false, error: "unauthorized" });
       const ss = SpreadsheetApp.getActiveSpreadsheet();
       // 이름이 어긋나도 죽지 않게 — 못 찾으면 첫 번째 탭에 쓴다.
       const sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
       // 헤더 행과 순서가 1:1로 맞아야 한다. 항목이 늘면 여기 맨 뒤에 덧붙인다.
       sheet.appendRow([
         new Date(),
         body.rating || "",
         body.ratingLabel || "",
         body.reason || "",
         body.comment || "",
         body.contact || "",
         body.interview || "",
       ]);
       return json({ ok: true });
     } catch (err) {
       return json({ ok: false, error: String(err) });
     }
   }
   function json(obj) {
     return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
       ContentService.MimeType.JSON,
     );
   }
   ```

3. **배포 → 새 배포 → 유형: 웹 앱** / 실행: **나** / 액세스 권한: **모든 사용자** 로 배포하고,
   생성된 `/exec` URL 을 복사합니다.

> **이미 배포해 둔 스크립트가 있다면** 위 코드로 갱신한 뒤 `새 배포` 가 아니라
> **배포 → 배포 관리 → (연필) → 버전: 새 버전 → 배포** 로 올리세요. `/exec` URL 이 그대로
> 유지됩니다. `새 배포` 를 누르면 URL 이 바뀌어 등록해 둔 값도 함께 고쳐야 합니다.
