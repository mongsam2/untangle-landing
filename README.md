This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## 체험 소감 저장 연동 (Google Sheets)

`/register`(체험 소감) 폼 제출은 서버 액션(`app/register/actions.ts`)을 거쳐 Google Apps
Script 웹 앱으로 전달되고, 지정한 스프레드시트에
`제출일시 · 만족도(점수) · 만족도 · 아쉬운 이유 · 자유 의견 · 사전 신청 연락처 · 인터뷰 참여 의향`
한 줄이 추가됩니다. 만족도는 1~5점이며, 아쉬운 이유는 1~3점일 때만 채워집니다.
자유 의견 · 사전 신청 연락처 · 인터뷰 참여 의향은 언제나 선택이라 비어 있을 수 있습니다.

> ### ⚠️ 배포 전에 반드시 해야 하는 일
>
> 소감 폼에 **사용자 인터뷰 참여 의향** 체크박스가 추가되었습니다. 서버 액션은 이미
> `interview` 필드를 함께 보내고 있지만, **Apps Script가 그 필드를 받아 적지 않으면 값은
> 조용히 버려집니다.** 스크립트가 `{ ok: true }` 를 돌려주므로 서버 액션은 정상 처리로
> 판단하고, 화면에는 "남겨주신 연락처로 인터뷰 일정을 곧 여쭤보고..." 가 그대로 뜹니다.
>
> 1. 시트 1행 맨 끝에 **`인터뷰 참여 의향`** 컬럼을 추가합니다. (아래 [1단계](#1-시트에-헤더-행-만들기))
> 2. Apps Script의 `appendRow` 마지막에 **`body.interview || ''`** 를 추가합니다. (아래 [2단계](#2-apps-script-웹-앱-배포))
> 3. **배포 → 배포 관리 → (연필) → 버전: 새 버전 → 배포** 로 다시 배포합니다. 코드만 저장하면 반영되지 않습니다.
> 4. `/register` 에서 인터뷰에 체크하고 연락처를 넣어 제출해 보고, 시트 마지막 칸에 `희망` 이 들어오는지 확인합니다.
>
> 연락처는 **정식 출시 안내와 인터뷰 요청 연락을 마친 뒤 즉시 파기**하기로 되어
> 있습니다([개인정보 처리방침](app/privacy/page.tsx) 3절). 시트에 쌓인 연락처도 쓰임을 다한
> 뒤 직접 지워 주세요.

### 1. 시트에 헤더 행 만들기

1행에 다음 컬럼을 순서대로 입력합니다.

| 제출일시 | 만족도(점수) | 만족도 | 아쉬운 이유 | 자유 의견 | 사전 신청 연락처 | 인터뷰 참여 의향 |
| --- | --- | --- | --- | --- | --- | --- |

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
   const TOKEN = 'PUT_A_LONG_RANDOM_STRING_HERE';
   const SHEET_NAME = '시트1';

   function doPost(e) {
     try {
       const body = JSON.parse(e.postData.contents);
       if (body.token !== TOKEN) return json({ ok: false, error: 'unauthorized' });
       const ss = SpreadsheetApp.getActiveSpreadsheet();
       // 이름이 어긋나도 죽지 않게 — 못 찾으면 첫 번째 탭에 쓴다.
       const sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
       // 헤더 행과 순서가 1:1로 맞아야 한다. 항목이 늘면 여기 맨 뒤에 덧붙인다.
       sheet.appendRow([new Date(), body.rating || '', body.ratingLabel || '', body.reason || '', body.comment || '', body.contact || '', body.interview || '']);
       return json({ ok: true });
     } catch (err) {
       return json({ ok: false, error: String(err) });
     }
   }
   function json(obj) {
     return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
   }
   ```

3. **배포 → 새 배포 → 유형: 웹 앱** / 실행: **나** / 액세스 권한: **모든 사용자** 로 배포하고,
   생성된 `/exec` URL 을 복사합니다.

> **이미 배포해 둔 스크립트가 있다면** 위 코드로 갱신한 뒤 `새 배포` 가 아니라
> **배포 → 배포 관리 → (연필) → 버전: 새 버전 → 배포** 로 올리세요. `/exec` URL 이 그대로
> 유지됩니다. `새 배포` 를 누르면 URL 이 바뀌어 등록해 둔 값도 함께 고쳐야 합니다.
