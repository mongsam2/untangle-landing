import { CHAT_LIMITS, parseChatRequest } from "@/lib/chat/contract";
import { createProxyErrorResponse, proxyChatRequest } from "@/lib/chat/proxy";

/**
 * 브라우저가 fetch로 대화를 보내므로 Route Handler를 서버 경계로 사용한다.
 * 실제 본문 크기와 공개 계약을 확인한 뒤 AI 프록시에만 전달한다.
 */

type BodyReadResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; reason: "invalid_request" | "request_too_large" };

async function readRequestBody(request: Request): Promise<BodyReadResult> {
  const contentLength = request.headers.get("Content-Length");
  if (
    contentLength !== null &&
    /^\d+$/.test(contentLength) &&
    Number(contentLength) > CHAT_LIMITS.bodyBytes
  ) {
    return { ok: false, reason: "request_too_large" };
  }

  if (request.body === null) {
    return { ok: true, bytes: new Uint8Array() };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      total += value.byteLength;
      if (total > CHAT_LIMITS.bodyBytes) {
        void reader.cancel().catch(() => undefined);
        return { ok: false, reason: "request_too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "invalid_request" };
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();

  const bodyResult = await readRequestBody(request);
  if (!bodyResult.ok) {
    return createProxyErrorResponse(bodyResult.reason, requestId);
  }

  let body: unknown;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      bodyResult.bytes,
    );
    body = JSON.parse(text);
  } catch {
    return createProxyErrorResponse("invalid_request", requestId);
  }

  const parsed = parseChatRequest(body);
  if (!parsed.ok) {
    return createProxyErrorResponse(parsed.reason, requestId);
  }

  return proxyChatRequest(parsed.value, requestId);
}
