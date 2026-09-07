import { describe, expect, test } from "bun:test";

import {
  CHAT_LIMITS,
  isUuid,
  jsonByteLength,
  parseAiErrorResponse,
  parseChatRequest,
  parseChatSuccessResponse,
  parseErrorResponse,
  toChatRequest,
  utf8ByteLength,
} from "@/lib/chat/contract";
import type { Message, Task } from "@/lib/chat/types";

/**
 * 공개 채팅 계약의 경계값과 엄격한 필드 검증을 고정한다.
 */

const TASK_ID = "0da6c6a5-6cc3-448c-857a-1917fc3af3d8";
const SUBTASK_ID = "d913da20-bfae-46dd-9cc7-0e15de399d45";
const OTHER_TASK_ID = "b777dd74-f22e-4bbc-aac6-3a6a14a0459b";
const REQUEST_ID = "4f08f49a-8515-4d31-b98d-0b503f20ec4d";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: TASK_ID,
    title: "논문 초안 작성하기",
    description: "모아둔 자료로 첫 초안을 만들어요.",
    subtasks: [{ id: SUBTASK_ID, title: "논문 파일 열기" }],
    ...overrides,
  };
}

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    messages: [{ role: "user", content: "논문이 신경 쓰여" }],
    tasks: [makeTask()],
    ...overrides,
  };
}

describe("UUID와 UTF-8 크기", () => {
  test("하이픈을 포함한 16진수 UUID만 허용한다", () => {
    expect(isUuid(TASK_ID)).toBe(true);
    expect(isUuid(TASK_ID.toUpperCase())).toBe(true);
    expect(isUuid(`  ${TASK_ID}  `)).toBe(true);
    expect(isUuid(TASK_ID.replaceAll("-", ""))).toBe(false);
    expect(isUuid("not-a-uuid")).toBe(false);
  });

  test("UTF-8 바이트와 JSON 직렬화 바이트를 실제 인코딩으로 센다", () => {
    expect(utf8ByteLength("a한🙂")).toBe(8);
    const value = { text: '한🙂"' };
    expect(jsonByteLength(value)).toBe(
      new TextEncoder().encode(JSON.stringify(value)).byteLength,
    );
  });

  test("JSON 본문의 256 KiB 경계를 정확히 구분한다", () => {
    expect(jsonByteLength("a".repeat(CHAT_LIMITS.bodyBytes - 2))).toBe(
      CHAT_LIMITS.bodyBytes,
    );
    expect(jsonByteLength("a".repeat(CHAT_LIMITS.bodyBytes - 1))).toBe(
      CHAT_LIMITS.bodyBytes + 1,
    );
  });
});

describe("채팅 요청", () => {
  test("유효한 값을 정규화하고 허용된 구조만 반환한다", () => {
    const result = parseChatRequest({
      messages: [{ role: "user", content: "  논문이 신경 쓰여  " }],
      tasks: [
        {
          id: `  ${TASK_ID}  `,
          title: "  논문 초안  ",
          description: "  첫 초안을 만들어요.  ",
          subtasks: [{ id: `  ${SUBTASK_ID}  `, title: "  파일 열기  " }],
        },
      ],
    });

    expect(result).toEqual({
      ok: true,
      value: {
        messages: [{ role: "user", content: "논문이 신경 쓰여" }],
        tasks: [
          {
            id: TASK_ID,
            title: "논문 초안",
            description: "첫 초안을 만들어요.",
            subtasks: [{ id: SUBTASK_ID, title: "파일 열기" }],
          },
        ],
      },
    });
  });

  test("루트와 중첩 객체의 알 수 없는 필드를 거절한다", () => {
    expect(parseChatRequest({ ...makeRequest(), provider: "openai" }).ok).toBe(
      false,
    );
    expect(
      parseChatRequest(
        makeRequest({
          messages: [{ role: "user", content: "내용", id: REQUEST_ID }],
        }),
      ).ok,
    ).toBe(false);
    expect(
      parseChatRequest(
        makeRequest({ tasks: [{ ...makeTask(), completed: true }] }),
      ).ok,
    ).toBe(false);
    expect(
      parseChatRequest(
        makeRequest({
          tasks: [
            {
              ...makeTask(),
              subtasks: [
                { id: SUBTASK_ID, title: "파일 열기", completed: true },
              ],
            },
          ],
        }),
      ).ok,
    ).toBe(false);
  });

  test("메시지는 1개부터 64개까지만 허용한다", () => {
    expect(parseChatRequest(makeRequest({ messages: [] })).ok).toBe(false);

    const maxMessages = Array.from(
      { length: CHAT_LIMITS.messages },
      (_, index): Message => ({
        role: index === CHAT_LIMITS.messages - 1 ? "user" : "assistant",
        content: "a",
      }),
    );
    expect(parseChatRequest(makeRequest({ messages: maxMessages })).ok).toBe(
      true,
    );
    expect(
      parseChatRequest(
        makeRequest({
          messages: [...maxMessages, { role: "user", content: "a" }],
        }),
      ).ok,
    ).toBe(false);
  });

  test("메시지 본문은 공백 제거 후 1자부터 4,000자까지다", () => {
    for (const content of [
      "a",
      "a".repeat(CHAT_LIMITS.messageContent),
      "🙂".repeat(CHAT_LIMITS.messageContent),
    ]) {
      expect(
        parseChatRequest(makeRequest({ messages: [{ role: "user", content }] }))
          .ok,
      ).toBe(true);
    }

    for (const content of [
      "   ",
      "a".repeat(CHAT_LIMITS.messageContent + 1),
      "🙂".repeat(CHAT_LIMITS.messageContent + 1),
    ]) {
      expect(
        parseChatRequest(makeRequest({ messages: [{ role: "user", content }] }))
          .ok,
      ).toBe(false);
    }
  });

  test("허용되지 않은 역할은 검증 오류이고 마지막 assistant는 요청 오류다", () => {
    expect(
      parseChatRequest(
        makeRequest({ messages: [{ role: " user ", content: "내용" }] }),
      ).ok,
    ).toBe(true);
    expect(
      parseChatRequest(
        makeRequest({ messages: [{ role: "system", content: "내용" }] }),
      ),
    ).toEqual({ ok: false, reason: "validation_error" });
    expect(
      parseChatRequest(
        makeRequest({ messages: [{ role: "assistant", content: "내용" }] }),
      ),
    ).toEqual({ ok: false, reason: "invalid_request" });
  });

  test("큰 할 일은 0개부터 7개까지만 허용한다", () => {
    expect(parseChatRequest(makeRequest({ tasks: [] })).ok).toBe(true);

    const tasks = Array.from({ length: CHAT_LIMITS.tasks }, (_, index) =>
      makeTask({
        id: `0000000${index}-0000-0000-0000-000000000000`,
        subtasks: [],
      }),
    );
    expect(parseChatRequest(makeRequest({ tasks })).ok).toBe(true);
    expect(
      parseChatRequest(
        makeRequest({
          tasks: [
            ...tasks,
            makeTask({ id: "00000007-0000-0000-0000-000000000000" }),
          ],
        }),
      ).ok,
    ).toBe(false);
  });

  test("제목과 설명의 최소·최대 길이를 검사한다", () => {
    for (const title of [
      "a",
      "a".repeat(CHAT_LIMITS.taskTitle),
      "🙂".repeat(CHAT_LIMITS.taskTitle),
    ]) {
      expect(
        parseChatRequest(makeRequest({ tasks: [makeTask({ title })] })).ok,
      ).toBe(true);
    }
    for (const title of [" ", "a".repeat(CHAT_LIMITS.taskTitle + 1)]) {
      expect(
        parseChatRequest(makeRequest({ tasks: [makeTask({ title })] })).ok,
      ).toBe(false);
    }

    for (const description of [
      "a",
      "a".repeat(CHAT_LIMITS.taskDescription),
      "🙂".repeat(CHAT_LIMITS.taskDescription),
    ]) {
      expect(
        parseChatRequest(makeRequest({ tasks: [makeTask({ description })] }))
          .ok,
      ).toBe(true);
    }
    for (const description of [
      " ",
      "a".repeat(CHAT_LIMITS.taskDescription + 1),
    ]) {
      expect(
        parseChatRequest(makeRequest({ tasks: [makeTask({ description })] }))
          .ok,
      ).toBe(false);
    }
  });

  test("서브태스크 제목과 7개 상한을 검사한다", () => {
    const subtasks = Array.from(
      { length: CHAT_LIMITS.subtasks },
      (_, index) => ({
        id: `1000000${index}-0000-0000-0000-000000000000`,
        title: index === 0 ? "a" : "a".repeat(CHAT_LIMITS.taskTitle),
      }),
    );
    expect(
      parseChatRequest(makeRequest({ tasks: [makeTask({ subtasks })] })).ok,
    ).toBe(true);
    expect(
      parseChatRequest(
        makeRequest({
          tasks: [
            makeTask({
              subtasks: [
                ...subtasks,
                {
                  id: "10000007-0000-0000-0000-000000000000",
                  title: "a",
                },
              ],
            }),
          ],
        }),
      ).ok,
    ).toBe(false);

    for (const title of [" ", "a".repeat(CHAT_LIMITS.taskTitle + 1)]) {
      expect(
        parseChatRequest(
          makeRequest({
            tasks: [makeTask({ subtasks: [{ id: SUBTASK_ID, title }] })],
          }),
        ).ok,
      ).toBe(false);
    }
  });

  test("잘못된 UUID와 대소문자만 다른 전체 목록 중복 ID를 거절한다", () => {
    expect(
      parseChatRequest(makeRequest({ tasks: [makeTask({ id: "bad-id" })] })).ok,
    ).toBe(false);
    expect(
      parseChatRequest(
        makeRequest({
          tasks: [makeTask({ subtasks: [{ id: TASK_ID, title: "중복" }] })],
        }),
      ).ok,
    ).toBe(false);
    expect(
      parseChatRequest(
        makeRequest({
          tasks: [
            makeTask({
              subtasks: [
                { id: SUBTASK_ID, title: "첫 번째" },
                { id: SUBTASK_ID.toUpperCase(), title: "두 번째" },
              ],
            }),
          ],
        }),
      ).ok,
    ).toBe(false);
    expect(
      parseChatRequest(
        makeRequest({
          tasks: [
            makeTask({ subtasks: [] }),
            makeTask({ id: TASK_ID.toUpperCase(), subtasks: [] }),
          ],
        }),
      ).ok,
    ).toBe(false);
    expect(
      parseChatRequest(
        makeRequest({
          tasks: [
            makeTask(),
            makeTask({
              id: OTHER_TASK_ID,
              subtasks: [{ id: SUBTASK_ID.toUpperCase(), title: "중복" }],
            }),
          ],
        }),
      ).ok,
    ).toBe(false);
  });

  test("전송 변환은 메시지의 로컬 ID와 요약을 구조적으로 제외한다", () => {
    const messages = [
      {
        id: REQUEST_ID,
        role: "assistant" as const,
        content: "정리했어요.",
        taskSummary: { count: 1, titles: ["논문"] },
      },
      {
        id: OTHER_TASK_ID,
        role: "user" as const,
        content: "계속해 줘",
      },
    ];

    const taskWithUiFields = {
      ...makeTask(),
      completed: true,
      subtasks: [{ id: SUBTASK_ID, title: "논문 파일 열기", completed: true }],
    };

    expect(toChatRequest(messages, [taskWithUiFields])).toEqual({
      messages: [
        { role: "assistant", content: "정리했어요." },
        { role: "user", content: "계속해 줘" },
      ],
      tasks: [makeTask()],
    });
  });

  test("검증과 전송 변환은 입력 객체를 변경하지 않는다", () => {
    const request = makeRequest();
    const before = structuredClone(request);

    expect(parseChatRequest(request).ok).toBe(true);
    expect(request).toEqual(before);
    expect(
      toChatRequest(request.messages as Message[], request.tasks as Task[]),
    ).not.toBe(request);
    expect(request).toEqual(before);
  });
});

describe("성공 응답", () => {
  test("chat 응답은 메시지만 허용하고 공백을 정리한다", () => {
    expect(
      parseChatSuccessResponse(
        { type: "chat", message: "  질문이에요.  " },
        200,
      ),
    ).toEqual({
      ok: true,
      value: { type: "chat", message: "질문이에요." },
    });
    expect(
      parseChatSuccessResponse(
        { type: "chat", message: "질문", tasks: [] },
        200,
      ).ok,
    ).toBe(false);
  });

  test("tasks 응답은 빈 전체 목록도 허용하고 혼합 필드를 거절한다", () => {
    expect(
      parseChatSuccessResponse(
        {
          type: "tasks",
          message: "모두 지웠어요.",
          tasks: [],
        },
        200,
      ),
    ).toEqual({
      ok: true,
      value: { type: "tasks", message: "모두 지웠어요.", tasks: [] },
    });
    expect(
      parseChatSuccessResponse(
        {
          type: "tasks",
          message: "정리했어요.",
          tasks: [makeTask()],
          extra: true,
        },
        200,
      ).ok,
    ).toBe(false);
    expect(
      parseChatSuccessResponse(
        {
          type: "tasks",
          message: "정리했어요.",
          tasks: [
            makeTask({ subtasks: [] }),
            makeTask({ id: TASK_ID.toUpperCase(), subtasks: [] }),
          ],
        },
        200,
      ).ok,
    ).toBe(false);
    expect(
      parseChatSuccessResponse(
        {
          type: "tasks",
          message: "정리했어요.",
          tasks: [{ ...makeTask(), hidden: true }],
        },
        200,
      ).ok,
    ).toBe(false);
  });

  test("응답 메시지는 1자부터 500자까지다", () => {
    for (const message of [
      "a",
      "a".repeat(CHAT_LIMITS.responseMessage),
      "🙂".repeat(CHAT_LIMITS.responseMessage),
    ]) {
      expect(parseChatSuccessResponse({ type: "chat", message }, 200).ok).toBe(
        true,
      );
    }
    for (const message of [" ", "a".repeat(CHAT_LIMITS.responseMessage + 1)]) {
      expect(parseChatSuccessResponse({ type: "chat", message }, 200).ok).toBe(
        false,
      );
    }
  });

  test("성공 본문은 HTTP 200에서만 허용한다", () => {
    expect(
      parseChatSuccessResponse({ type: "chat", message: "질문이에요." }, 201)
        .ok,
    ).toBe(false);
  });

  test("성공 응답의 필수 필드와 종류를 검사한다", () => {
    expect(parseChatSuccessResponse({ type: "chat" }, 200).ok).toBe(false);
    expect(
      parseChatSuccessResponse({ type: "tasks", message: "정리했어요." }, 200)
        .ok,
    ).toBe(false);
    expect(
      parseChatSuccessResponse({ type: "unknown", message: "정리했어요." }, 200)
        .ok,
    ).toBe(false);
  });
});

describe("오류 응답", () => {
  test.each([
    [400, "invalid_request"],
    [413, "request_too_large"],
    [422, "validation_error"],
    [429, "provider_rate_limited"],
    [502, "provider_error"],
    [502, "model_output_invalid"],
    [503, "provider_not_configured"],
    [504, "provider_timeout"],
    [500, "internal_error"],
    [502, "ai_unavailable"],
    [502, "ai_response_invalid"],
    [503, "ai_not_configured"],
    [504, "ai_timeout"],
  ] as const)("HTTP %i와 %s 조합을 허용한다", (status, code) => {
    expect(
      parseErrorResponse(
        {
          error: {
            code,
            message: "  다시 시도해 주세요.  ",
            request_id: REQUEST_ID,
          },
        },
        status,
      ),
    ).toEqual({
      ok: true,
      value: {
        error: { code, message: "다시 시도해 주세요.", request_id: REQUEST_ID },
      },
    });
  });

  test("상태·코드 불일치와 알 수 없는 필드를 거절한다", () => {
    expect(
      parseErrorResponse(
        {
          error: {
            code: "provider_timeout",
            message: "늦어지고 있어요.",
            request_id: REQUEST_ID,
          },
        },
        502,
      ).ok,
    ).toBe(false);
    expect(
      parseErrorResponse(
        {
          error: {
            code: "internal_error",
            message: "오류가 발생했어요.",
            request_id: REQUEST_ID,
          },
          detail: "secret",
        },
        500,
      ).ok,
    ).toBe(false);
    expect(
      parseErrorResponse(
        {
          error: {
            code: "internal_error",
            message: "오류가 발생했어요.",
            request_id: REQUEST_ID,
          },
        },
        200,
      ).ok,
    ).toBe(false);
    expect(
      parseErrorResponse(
        {
          error: {
            code: "provider_timeout",
            message: "늦어지고 있어요.",
            request_id: REQUEST_ID,
            detail: "secret",
          },
        },
        504,
      ).ok,
    ).toBe(false);
  });

  test("오류 메시지와 request ID 경계를 검사한다", () => {
    for (const message of [
      "a",
      "a".repeat(CHAT_LIMITS.errorMessage),
      "🙂".repeat(CHAT_LIMITS.errorMessage),
    ]) {
      expect(
        parseErrorResponse(
          {
            error: { code: "internal_error", message, request_id: REQUEST_ID },
          },
          500,
        ).ok,
      ).toBe(true);
    }
    for (const message of [" ", "a".repeat(CHAT_LIMITS.errorMessage + 1)]) {
      expect(
        parseErrorResponse(
          {
            error: { code: "internal_error", message, request_id: REQUEST_ID },
          },
          500,
        ).ok,
      ).toBe(false);
    }
    expect(
      parseErrorResponse(
        {
          error: {
            code: "internal_error",
            message: "오류가 발생했어요.",
            request_id: "bad-id",
          },
        },
        500,
      ).ok,
    ).toBe(false);
  });

  test("AI 오류 검증은 프록시 전용 코드를 거절한다", () => {
    expect(
      parseAiErrorResponse(
        {
          error: {
            code: "provider_error",
            message: "다시 시도해 주세요.",
            request_id: REQUEST_ID,
          },
        },
        502,
      ).ok,
    ).toBe(true);
    expect(
      parseAiErrorResponse(
        {
          error: {
            code: "ai_unavailable",
            message: "다시 시도해 주세요.",
            request_id: REQUEST_ID,
          },
        },
        502,
      ).ok,
    ).toBe(false);
  });
});
