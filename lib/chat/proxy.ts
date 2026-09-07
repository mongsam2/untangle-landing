import "server-only";

import {
  isUuid,
  parseAiErrorResponse,
  parseChatSuccessResponse,
} from "./contract";
import type { ChatRequest, ErrorResponse, ProxyErrorCode } from "./types";

/**
 * 검증된 채팅 요청을 AI 서버에 전달하고 공개 응답으로 닫는다.
 * 서버 내부 예외와 upstream 원문은 브라우저 경계 밖에 남긴다.
 */

export const DEFAULT_AI_BASE_URL = "http://127.0.0.1:8000";
export const AI_TIMEOUT_MS = 65_000;

const PROXY_ERRORS = {
  invalid_request: {
    status: 400,
    message: "요청 형식이 올바르지 않아요.",
  },
  request_too_large: {
    status: 413,
    message: "한 번에 보낼 내용이 너무 많아요. 입력을 줄여 주세요.",
  },
  validation_error: {
    status: 422,
    message: "요청 내용을 확인해 주세요.",
  },
  ai_unavailable: {
    status: 502,
    message: "AI 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.",
  },
  ai_response_invalid: {
    status: 502,
    message: "AI 응답을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
  },
  ai_not_configured: {
    status: 503,
    message: "AI 서버 연결이 준비되지 않았어요.",
  },
  ai_timeout: {
    status: 504,
    message: "AI 응답이 늦어지고 있어요. 잠시 후 다시 시도해 주세요.",
  },
} as const satisfies Record<
  ProxyErrorCode,
  { status: number; message: string }
>;

type FetchImplementation = typeof fetch;

interface ProxyOptions {
  baseUrl?: string;
  fetchImplementation?: FetchImplementation;
  timeoutMs?: number;
}

function normalizeRequestId(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalized = value.trim();
  return isUuid(normalized) ? normalized : null;
}

function withRequestId(
  response: ErrorResponse,
  requestId: string,
): ErrorResponse {
  return {
    error: {
      ...response.error,
      request_id: requestId,
    },
  };
}

function jsonResponse(
  body: unknown,
  status: number,
  requestId: string,
): Response {
  return Response.json(body, {
    status,
    headers: {
      // 대화 원문이 브라우저와 중간 캐시에 남지 않도록 응답 재사용을 막는다.
      "Cache-Control": "no-store",
      "X-Request-ID": requestId,
    },
  });
}

/** AI 서버 기본 주소를 안전한 HTTP(S) 주소로 정규화한다. */
export function normalizeAiBaseUrl(value: string | undefined): string | null {
  const candidate = value?.trim() || DEFAULT_AI_BASE_URL;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    if (url.search || url.hash) {
      return null;
    }

    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/** 고정 메시지와 request ID를 가진 안전한 프록시 오류를 만든다. */
export function createProxyErrorResponse(
  code: ProxyErrorCode,
  requestId: string,
): Response {
  const error = PROXY_ERRORS[code];
  return jsonResponse(
    {
      error: {
        code,
        message: error.message,
        request_id: requestId,
      },
    } satisfies ErrorResponse,
    error.status,
    requestId,
  );
}

/** 검증된 요청을 AI 서버에 전달하고 계약에 맞는 응답만 반환한다. */
export async function proxyChatRequest(
  request: ChatRequest,
  requestId: string,
  options: ProxyOptions = {},
): Promise<Response> {
  const baseUrl = normalizeAiBaseUrl(
    options.baseUrl ?? process.env.UNTANGLE_AI_BASE_URL,
  );
  if (baseUrl === null) {
    return createProxyErrorResponse("ai_not_configured", requestId);
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? AI_TIMEOUT_MS);

  let upstream: Response;
  let rawUpstreamRequestId: string | null = null;
  let upstreamRequestId: string | null = null;
  let upstreamText: string;
  try {
    upstream = await (options.fetchImplementation ?? fetch)(
      `${baseUrl}/v1/chat`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
        // 사용자마다 다른 AI 응답이 Next.js 데이터 캐시에 들어가지 않게 한다.
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      },
    );
    rawUpstreamRequestId = upstream.headers.get("X-Request-ID");
    upstreamRequestId = normalizeRequestId(rawUpstreamRequestId);
    upstreamText = await upstream.text();
  } catch {
    return createProxyErrorResponse(
      timedOut ? "ai_timeout" : "ai_unavailable",
      upstreamRequestId ?? requestId,
    );
  } finally {
    clearTimeout(timeout);
  }

  const contentType = upstream.headers
    .get("Content-Type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    return createProxyErrorResponse(
      "ai_response_invalid",
      upstreamRequestId ?? requestId,
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(upstreamText);
  } catch {
    return createProxyErrorResponse(
      "ai_response_invalid",
      upstreamRequestId ?? requestId,
    );
  }

  const success = parseChatSuccessResponse(body, upstream.status);
  if (success.ok) {
    return jsonResponse(success.value, 200, upstreamRequestId ?? requestId);
  }

  const error = parseAiErrorResponse(body, upstream.status);
  if (!error.ok) {
    return createProxyErrorResponse(
      "ai_response_invalid",
      upstreamRequestId ?? requestId,
    );
  }

  const bodyRequestId = error.value.error.request_id;
  if (
    upstreamRequestId !== null &&
    upstreamRequestId.toLowerCase() !== bodyRequestId.toLowerCase()
  ) {
    return createProxyErrorResponse("ai_response_invalid", upstreamRequestId);
  }

  const responseRequestId =
    rawUpstreamRequestId === null
      ? bodyRequestId
      : (upstreamRequestId ?? requestId);
  return jsonResponse(
    withRequestId(error.value, responseRequestId),
    upstream.status,
    responseRequestId,
  );
}
