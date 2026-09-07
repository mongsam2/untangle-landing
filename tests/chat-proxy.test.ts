import { afterEach, describe, expect, mock, test } from "bun:test";

import { CHAT_LIMITS, isUuid } from "@/lib/chat/contract";
import type { ChatRequest } from "@/lib/chat/types";

/**
 * 채팅 프록시와 Route Handler의 성공·오류 경계를 네트워크 없이 검증한다.
 */

// proxy 모듈이 import 되기 전에 server-only 를 대체해야 테스트 환경에서 불러올 수 있다.
mock.module("server-only", () => ({}));

const {
  DEFAULT_AI_BASE_URL,
  createProxyErrorResponse,
  normalizeAiBaseUrl,
  proxyChatRequest,
} = await import("@/lib/chat/proxy");
const { POST } = await import("@/app/api/chat/route");

const PROXY_REQUEST_ID = "4f08f49a-8515-4d31-b98d-0b503f20ec4d";
const UPSTREAM_REQUEST_ID = "b777dd74-f22e-4bbc-aac6-3a6a14a0459b";
const OTHER_REQUEST_ID = "0da6c6a5-6cc3-448c-857a-1917fc3af3d8";
const TASK_ID = "d913da20-bfae-46dd-9cc7-0e15de399d45";

const originalFetch = globalThis.fetch;
const originalBaseUrl = process.env.UNTANGLE_AI_BASE_URL;

const request: ChatRequest = {
  messages: [{ role: "user", content: "논문이 신경 쓰여" }],
  tasks: [],
};

function jsonUpstream(
  body: unknown,
  status = 200,
  requestId: string | null = UPSTREAM_REQUEST_ID,
): Response {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (requestId !== null) {
    headers.set("X-Request-ID", requestId);
  }
  return new Response(JSON.stringify(body), { status, headers });
}

async function responseBody(response: Response): Promise<unknown> {
  return response.json();
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalBaseUrl === undefined) {
    delete process.env.UNTANGLE_AI_BASE_URL;
  } else {
    process.env.UNTANGLE_AI_BASE_URL = originalBaseUrl;
  }
});

describe("AI 서버 주소", () => {
  test("빈 값에는 로컬 기본값을 쓰고 마지막 슬래시를 정리한다", () => {
    expect(normalizeAiBaseUrl(undefined)).toBe(DEFAULT_AI_BASE_URL);
    expect(normalizeAiBaseUrl("   ")).toBe(DEFAULT_AI_BASE_URL);
    expect(normalizeAiBaseUrl(" https://ai.example.com/base/// ")).toBe(
      "https://ai.example.com/base",
    );
  });

  test("HTTP(S)가 아니거나 쿼리·해시가 있는 주소를 거절한다", () => {
    expect(normalizeAiBaseUrl("ftp://ai.example.com")).toBeNull();
    expect(normalizeAiBaseUrl("not a url")).toBeNull();
    expect(
      normalizeAiBaseUrl("https://ai.example.com?token=secret"),
    ).toBeNull();
    expect(normalizeAiBaseUrl("https://ai.example.com#fragment")).toBeNull();
  });
});

describe("프록시 성공 응답", () => {
  test("검증된 요청을 provider 없이 no-store로 전달한다", async () => {
    let calledUrl: string | URL | Request | undefined;
    let calledInit: RequestInit | undefined;
    const fetchImplementation = mock(
      async (input: string | URL | Request, init?: RequestInit) => {
        calledUrl = input;
        calledInit = init;
        return jsonUpstream({ type: "chat", message: "어디까지 진행했어요?" });
      },
    ) as unknown as typeof fetch;

    const response = await proxyChatRequest(request, PROXY_REQUEST_ID, {
      baseUrl: "https://ai.example.com/",
      fetchImplementation,
    });

    expect(calledUrl).toBe("https://ai.example.com/v1/chat");
    expect(calledInit?.method).toBe("POST");
    expect(calledInit?.cache).toBe("no-store");
    expect(calledInit?.redirect).toBe("error");
    expect(calledInit?.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(calledInit?.headers).get("Content-Type")).toBe(
      "application/json",
    );
    expect(new Headers(calledInit?.headers).get("Accept")).toBe(
      "application/json",
    );
    expect(JSON.parse(String(calledInit?.body))).toEqual(request);
    expect(String(calledInit?.body)).not.toContain("provider");
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Request-ID")).toBe(UPSTREAM_REQUEST_ID);
    expect(await responseBody(response)).toEqual({
      type: "chat",
      message: "어디까지 진행했어요?",
    });
  });

  test("tasks 전체 스냅샷을 검증하고 전달한다", async () => {
    const tasksResponse = {
      type: "tasks",
      message: "정리했어요.",
      tasks: [
        {
          id: TASK_ID,
          title: "  논문 초안  ",
          description: "  첫 초안을 만들어요.  ",
          subtasks: [],
        },
      ],
    };
    const response = await proxyChatRequest(request, PROXY_REQUEST_ID, {
      fetchImplementation: mock(async () =>
        jsonUpstream(tasksResponse),
      ) as unknown as typeof fetch,
    });

    expect(response.status).toBe(200);
    expect(await responseBody(response)).toEqual({
      ...tasksResponse,
      tasks: [
        {
          ...tasksResponse.tasks[0],
          title: "논문 초안",
          description: "첫 초안을 만들어요.",
        },
      ],
    });
  });

  test("성공 응답의 request ID가 없거나 잘못되면 프록시 ID를 쓴다", async () => {
    for (const upstreamId of [null, "bad-id"]) {
      const response = await proxyChatRequest(request, PROXY_REQUEST_ID, {
        fetchImplementation: mock(async () =>
          jsonUpstream(
            { type: "chat", message: "질문이에요." },
            200,
            upstreamId,
          ),
        ) as unknown as typeof fetch,
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("X-Request-ID")).toBe(PROXY_REQUEST_ID);
    }
  });
});

describe("AI 서버 오류와 계약 위반", () => {
  test("유효한 AI 오류와 일치하는 request ID를 그대로 전달한다", async () => {
    const upstreamBody = {
      error: {
        code: "provider_rate_limited",
        message: "잠시 후 다시 시도해 주세요.",
        request_id: UPSTREAM_REQUEST_ID,
      },
    };
    const response = await proxyChatRequest(request, PROXY_REQUEST_ID, {
      fetchImplementation: mock(async () =>
        jsonUpstream(upstreamBody, 429),
      ) as unknown as typeof fetch,
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("X-Request-ID")).toBe(UPSTREAM_REQUEST_ID);
    expect(await responseBody(response)).toEqual(upstreamBody);
  });

  test("오류 헤더가 없으면 본문 ID를 사용한다", async () => {
    const response = await proxyChatRequest(request, PROXY_REQUEST_ID, {
      fetchImplementation: mock(async () =>
        jsonUpstream(
          {
            error: {
              code: "provider_timeout",
              message: "늦어지고 있어요.",
              request_id: UPSTREAM_REQUEST_ID,
            },
          },
          504,
          null,
        ),
      ) as unknown as typeof fetch,
    });

    expect(response.status).toBe(504);
    expect(response.headers.get("X-Request-ID")).toBe(UPSTREAM_REQUEST_ID);
    expect((await response.json()).error.request_id).toBe(UPSTREAM_REQUEST_ID);
  });

  test("잘못된 오류 헤더는 프록시 ID로 교체한다", async () => {
    const response = await proxyChatRequest(request, PROXY_REQUEST_ID, {
      fetchImplementation: mock(async () =>
        jsonUpstream(
          {
            error: {
              code: "provider_error",
              message: "다시 시도해 주세요.",
              request_id: UPSTREAM_REQUEST_ID,
            },
          },
          502,
          "bad-id",
        ),
      ) as unknown as typeof fetch,
    });

    expect(response.status).toBe(502);
    expect(response.headers.get("X-Request-ID")).toBe(PROXY_REQUEST_ID);
    expect((await response.json()).error).toEqual({
      code: "provider_error",
      message: "다시 시도해 주세요.",
      request_id: PROXY_REQUEST_ID,
    });
  });

  test("유효하지만 서로 다른 오류 request ID는 계약 위반으로 닫는다", async () => {
    const response = await proxyChatRequest(request, PROXY_REQUEST_ID, {
      fetchImplementation: mock(async () =>
        jsonUpstream(
          {
            error: {
              code: "provider_error",
              message: "원문 오류",
              request_id: OTHER_REQUEST_ID,
            },
          },
          502,
        ),
      ) as unknown as typeof fetch,
    });

    expect(response.status).toBe(502);
    expect(response.headers.get("X-Request-ID")).toBe(UPSTREAM_REQUEST_ID);
    expect(await responseBody(response)).toEqual({
      error: {
        code: "ai_response_invalid",
        message: "AI 응답을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
        request_id: UPSTREAM_REQUEST_ID,
      },
    });
  });

  test.each([
    ["not-json", 200, "application/json"],
    [
      JSON.stringify({ type: "chat", message: "질문", tasks: [] }),
      200,
      "application/json",
    ],
    [
      JSON.stringify({ type: "chat", message: "질문" }),
      201,
      "application/json",
    ],
    [
      JSON.stringify({
        error: {
          code: "provider_timeout",
          message: "늦어지고 있어요.",
          request_id: UPSTREAM_REQUEST_ID,
        },
      }),
      502,
      "application/json",
    ],
    [JSON.stringify({ type: "chat", message: "질문" }), 200, "text/plain"],
  ] as const)(
    "잘못된 upstream 본문 또는 상태를 안전하게 매핑한다",
    async (body, status, contentType) => {
      const response = await proxyChatRequest(request, PROXY_REQUEST_ID, {
        fetchImplementation: mock(
          async () =>
            new Response(body, {
              status,
              headers: {
                "Content-Type": contentType,
                "X-Request-ID": UPSTREAM_REQUEST_ID,
              },
            }),
        ) as unknown as typeof fetch,
      });

      expect(response.status).toBe(502);
      expect((await response.json()).error.code).toBe("ai_response_invalid");
    },
  );

  test("연결 예외 원문을 노출하거나 기록하지 않는다", async () => {
    const marker = "SHOULD_NOT_LEAK_UPSTREAM_EXCEPTION";
    const previousConsoleError = console.error;
    const consoleError = mock(() => {});
    console.error = consoleError;
    try {
      const response = await proxyChatRequest(request, PROXY_REQUEST_ID, {
        fetchImplementation: mock(async () => {
          throw new Error(marker);
        }) as unknown as typeof fetch,
      });
      const text = await response.text();

      expect(response.status).toBe(502);
      expect(text).not.toContain(marker);
      expect(JSON.parse(text).error.code).toBe("ai_unavailable");
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      console.error = previousConsoleError;
    }
  });

  test("요청과 비정상 응답 원문을 어떤 console이나 오류에도 남기지 않는다", async () => {
    const requestMarker = "PRIVATE_REQUEST_MARKER";
    const responseMarker = "PRIVATE_UPSTREAM_MARKER";
    const originalConsole = {
      error: console.error,
      info: console.info,
      log: console.log,
      warn: console.warn,
    };
    const spies = {
      error: mock(() => {}),
      info: mock(() => {}),
      log: mock(() => {}),
      warn: mock(() => {}),
    };
    Object.assign(console, spies);
    try {
      const response = await proxyChatRequest(
        {
          messages: [{ role: "user", content: requestMarker }],
          tasks: [],
        },
        PROXY_REQUEST_ID,
        {
          fetchImplementation: mock(
            async () =>
              new Response(responseMarker, {
                status: 502,
                headers: { "Content-Type": "application/json" },
              }),
          ) as unknown as typeof fetch,
        },
      );
      const text = await response.text();

      expect(text).not.toContain(requestMarker);
      expect(text).not.toContain(responseMarker);
      expect(spies.error).not.toHaveBeenCalled();
      expect(spies.info).not.toHaveBeenCalled();
      expect(spies.log).not.toHaveBeenCalled();
      expect(spies.warn).not.toHaveBeenCalled();
    } finally {
      Object.assign(console, originalConsole);
    }
  });

  test("65초 경계의 abort를 안전한 timeout으로 매핑한다", async () => {
    const fetchImplementation = mock(
      async (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("SECRET_TIMEOUT", "AbortError"));
          });
        }),
    ) as unknown as typeof fetch;

    const response = await proxyChatRequest(request, PROXY_REQUEST_ID, {
      fetchImplementation,
      timeoutMs: 1,
    });

    expect(response.status).toBe(504);
    expect((await response.json()).error.code).toBe("ai_timeout");
  });

  test("헤더 뒤 지연되는 응답 본문도 timeout 안에 포함한다", async () => {
    const fetchImplementation = mock(
      async (_input: string | URL | Request, init?: RequestInit) =>
        new Response(
          new ReadableStream({
            start(controller) {
              init?.signal?.addEventListener("abort", () => {
                controller.error(
                  new DOMException("SECRET_BODY_TIMEOUT", "AbortError"),
                );
              });
            },
          }),
          {
            status: 200,
            headers: { "X-Request-ID": UPSTREAM_REQUEST_ID },
          },
        ),
    ) as unknown as typeof fetch;

    const response = await proxyChatRequest(request, PROXY_REQUEST_ID, {
      fetchImplementation,
      timeoutMs: 1,
    });

    expect(response.status).toBe(504);
    expect(response.headers.get("X-Request-ID")).toBe(UPSTREAM_REQUEST_ID);
    expect((await response.json()).error.code).toBe("ai_timeout");
  });

  test("잘못된 서버 주소는 fetch 전에 설정 오류로 닫는다", async () => {
    const fetchImplementation = mock(async () =>
      jsonUpstream({ type: "chat", message: "호출되면 안 돼요." }),
    ) as unknown as typeof fetch;
    const response = await proxyChatRequest(request, PROXY_REQUEST_ID, {
      baseUrl: "file:///tmp/ai",
      fetchImplementation,
    });

    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("ai_not_configured");
  });
});

describe("프록시 오류 생성", () => {
  test("오류 본문과 헤더에 같은 request ID를 넣는다", async () => {
    const response = createProxyErrorResponse(
      "validation_error",
      PROXY_REQUEST_ID,
    );
    expect(response.status).toBe(422);
    expect(response.headers.get("X-Request-ID")).toBe(PROXY_REQUEST_ID);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await response.json()).error.request_id).toBe(PROXY_REQUEST_ID);
  });
});

describe("POST /api/chat", () => {
  test("유효한 요청을 전체 경로로 전달한다", async () => {
    process.env.UNTANGLE_AI_BASE_URL = "https://ai.example.com";
    const fetchImplementation = mock(async () =>
      jsonUpstream({ type: "chat", message: "어디까지 진행했어요?" }),
    ) as unknown as typeof fetch;
    globalThis.fetch = fetchImplementation;

    const response = await POST(
      new Request("http://local.test/api/chat", {
        method: "POST",
        body: JSON.stringify(request),
      }),
    );

    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Request-ID")).toBe(UPSTREAM_REQUEST_ID);
    expect(await responseBody(response)).toEqual({
      type: "chat",
      message: "어디까지 진행했어요?",
    });
  });

  test("provider와 알 수 없는 필드는 AI 서버를 호출하지 않고 거절한다", async () => {
    const fetchImplementation = mock(async () =>
      jsonUpstream({ type: "chat", message: "호출되면 안 돼요." }),
    ) as unknown as typeof fetch;
    globalThis.fetch = fetchImplementation;

    const response = await POST(
      new Request("http://local.test/api/chat", {
        method: "POST",
        body: JSON.stringify({ ...request, provider: "gpt" }),
      }),
    );

    const body = await response.json();
    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(response.status).toBe(422);
    expect(body.error.code).toBe("validation_error");
    expect(body.error.request_id).toBe(response.headers.get("X-Request-ID"));
    expect(isUuid(body.error.request_id)).toBe(true);
  });

  test("실제 본문이 256 KiB를 넘으면 JSON 파싱 전에 413을 반환한다", async () => {
    const fetchImplementation = mock(async () =>
      jsonUpstream({ type: "chat", message: "호출되면 안 돼요." }),
    ) as unknown as typeof fetch;
    globalThis.fetch = fetchImplementation;

    const response = await POST(
      new Request("http://local.test/api/chat", {
        method: "POST",
        body: "x".repeat(CHAT_LIMITS.bodyBytes + 1),
      }),
    );

    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(response.status).toBe(413);
    expect((await response.json()).error.code).toBe("request_too_large");
  });

  test("JSON 오류와 마지막 assistant를 400으로 구분한다", async () => {
    const invalidJson = await POST(
      new Request("http://local.test/api/chat", {
        method: "POST",
        body: "{bad json",
      }),
    );
    const lastAssistant = await POST(
      new Request("http://local.test/api/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: [{ role: "assistant", content: "질문이에요." }],
          tasks: [],
        }),
      }),
    );

    expect(invalidJson.status).toBe(400);
    expect((await invalidJson.json()).error.code).toBe("invalid_request");
    expect(lastAssistant.status).toBe(400);
    expect((await lastAssistant.json()).error.code).toBe("invalid_request");
  });

  test("필드·길이·UUID·중복 오류를 422로 구분한다", async () => {
    const invalidRequests = [
      { messages: [{ role: "user", content: " " }], tasks: [] },
      {
        messages: [{ role: "user", content: "내용" }],
        tasks: [
          {
            id: "bad-id",
            title: "할 일",
            description: "설명",
            subtasks: [],
          },
        ],
      },
      {
        messages: [{ role: "user", content: "내용" }],
        tasks: [
          {
            id: TASK_ID,
            title: "할 일",
            description: "설명",
            subtasks: [{ id: TASK_ID.toUpperCase(), title: "중복" }],
          },
        ],
      },
    ];

    for (const invalidRequest of invalidRequests) {
      const response = await POST(
        new Request("http://local.test/api/chat", {
          method: "POST",
          body: JSON.stringify(invalidRequest),
        }),
      );
      expect(response.status).toBe(422);
      expect((await response.json()).error.code).toBe("validation_error");
    }
  });
});
