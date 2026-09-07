import type {
  AiErrorCode,
  ChatRequest,
  ChatSuccessResponse,
  ErrorCode,
  ErrorResponse,
  Message,
  Task,
} from "./types";

/**
 * 네트워크 경계의 채팅 값을 엄격히 검증하고 정규화한다.
 * 검증에 실패한 일부 값을 복구하지 않아 손상된 상태의 전파를 막는다.
 */

export const CHAT_LIMITS = {
  bodyBytes: 256 * 1024,
  messages: 64,
  messageContent: 4_000,
  responseMessage: 500,
  tasks: 7,
  taskTitle: 100,
  taskDescription: 500,
  subtasks: 7,
  errorMessage: 200,
} as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ERROR_STATUS_BY_CODE = {
  invalid_request: 400,
  request_too_large: 413,
  validation_error: 422,
  provider_rate_limited: 429,
  provider_error: 502,
  model_output_invalid: 502,
  provider_not_configured: 503,
  provider_timeout: 504,
  internal_error: 500,
  ai_unavailable: 502,
  ai_response_invalid: 502,
  ai_not_configured: 503,
  ai_timeout: 504,
} as const satisfies Record<ErrorCode, number>;

const AI_ERROR_CODES = new Set<AiErrorCode>([
  "invalid_request",
  "request_too_large",
  "validation_error",
  "provider_rate_limited",
  "provider_error",
  "model_output_invalid",
  "provider_not_configured",
  "provider_timeout",
  "internal_error",
]);

export type ChatRequestFailure = "invalid_request" | "validation_error";

export type ParseResult<T, TReason extends string = "validation_error"> =
  { ok: true; value: T } | { ok: false; reason: TReason };

type MessageSource = Pick<Message, "role" | "content">;

/** 배열이 아닌 순수 객체인지 확인한다. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 허용한 키 외의 필드가 없는지 확인한다. */
export function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

/** 공백을 제거한 뒤 길이 범위를 만족하는 문자열만 돌려준다. */
export function parseTrimmedString(
  value: unknown,
  maxLength: number,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  const characterCount = Array.from(normalized).length;
  if (characterCount === 0 || characterCount > maxLength) {
    return null;
  }

  return normalized;
}

function parseUuid(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function parseMessage(value: unknown): Message | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["role", "content"])) {
    return null;
  }

  const role = typeof value.role === "string" ? value.role.trim() : value.role;
  if (role !== "user" && role !== "assistant") {
    return null;
  }

  const content = parseTrimmedString(value.content, CHAT_LIMITS.messageContent);
  if (content === null) {
    return null;
  }

  return { role, content };
}

function parseTasks(value: unknown): Task[] | null {
  if (!Array.isArray(value) || value.length > CHAT_LIMITS.tasks) {
    return null;
  }

  const ids = new Set<string>();
  const tasks: Task[] = [];

  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      !hasOnlyKeys(candidate, ["id", "title", "description", "subtasks"]) ||
      !Array.isArray(candidate.subtasks) ||
      candidate.subtasks.length > CHAT_LIMITS.subtasks
    ) {
      return null;
    }

    const id = parseUuid(candidate.id);
    if (id === null || ids.has(id.toLowerCase())) {
      return null;
    }
    ids.add(id.toLowerCase());

    const title = parseTrimmedString(candidate.title, CHAT_LIMITS.taskTitle);
    const description = parseTrimmedString(
      candidate.description,
      CHAT_LIMITS.taskDescription,
    );
    if (title === null || description === null) {
      return null;
    }

    const subtasks = [];
    for (const subtask of candidate.subtasks) {
      if (!isRecord(subtask) || !hasOnlyKeys(subtask, ["id", "title"])) {
        return null;
      }

      const subtaskId = parseUuid(subtask.id);
      const subtaskTitle = parseTrimmedString(
        subtask.title,
        CHAT_LIMITS.taskTitle,
      );
      if (
        subtaskId === null ||
        ids.has(subtaskId.toLowerCase()) ||
        subtaskTitle === null
      ) {
        return null;
      }
      ids.add(subtaskId.toLowerCase());
      subtasks.push({ id: subtaskId, title: subtaskTitle });
    }

    tasks.push({
      id,
      title,
      description,
      subtasks,
    });
  }

  return tasks;
}

function isErrorCode(value: unknown): value is ErrorCode {
  return (
    typeof value === "string" && Object.hasOwn(ERROR_STATUS_BY_CODE, value)
  );
}

/** UUID 공개 계약의 표기 형식인지 확인한다. */
export function isUuid(value: unknown): value is string {
  return parseUuid(value) !== null;
}

/** UTF-8로 직렬화한 문자열의 실제 바이트 수를 계산한다. */
export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

/** JSON 직렬화 결과의 UTF-8 바이트 수를 계산한다. */
export function jsonByteLength(value: unknown): number {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new TypeError("JSON으로 직렬화할 수 없는 값이에요.");
  }
  return utf8ByteLength(serialized);
}

/** UI 전용 메시지 필드를 제외한 공개 요청을 만든다. */
export function toChatRequest(
  messages: readonly MessageSource[],
  tasks: readonly Task[],
): ChatRequest {
  return {
    messages: messages.map(({ role, content }) => ({
      role,
      content: content.trim(),
    })),
    tasks: tasks.map((task) => ({
      id: task.id.trim(),
      title: task.title.trim(),
      description: task.description.trim(),
      subtasks: task.subtasks.map((subtask) => ({
        id: subtask.id.trim(),
        title: subtask.title.trim(),
      })),
    })),
  };
}

/** 공개 채팅 요청을 검증하고 공백을 정리한다. */
export function parseChatRequest(
  value: unknown,
): ParseResult<ChatRequest, ChatRequestFailure> {
  if (!isRecord(value) || !hasOnlyKeys(value, ["messages", "tasks"])) {
    return { ok: false, reason: "validation_error" };
  }

  if (
    !Array.isArray(value.messages) ||
    value.messages.length === 0 ||
    value.messages.length > CHAT_LIMITS.messages
  ) {
    return { ok: false, reason: "validation_error" };
  }

  const messages: Message[] = [];
  for (const candidate of value.messages) {
    const message = parseMessage(candidate);
    if (message === null) {
      return { ok: false, reason: "validation_error" };
    }
    messages.push(message);
  }

  if (messages.at(-1)?.role !== "user") {
    return { ok: false, reason: "invalid_request" };
  }

  const tasks = parseTasks(value.tasks);
  if (tasks === null) {
    return { ok: false, reason: "validation_error" };
  }

  return { ok: true, value: { messages, tasks } };
}

/** AI 성공 응답을 검증하고 공백을 정리한다. */
export function parseChatSuccessResponse(
  value: unknown,
  status: number,
): ParseResult<ChatSuccessResponse> {
  if (!isRecord(value) || status !== 200) {
    return { ok: false, reason: "validation_error" };
  }

  const message = parseTrimmedString(
    value.message,
    CHAT_LIMITS.responseMessage,
  );
  if (message === null) {
    return { ok: false, reason: "validation_error" };
  }

  const type = typeof value.type === "string" ? value.type.trim() : value.type;
  if (type === "chat") {
    if (!hasOnlyKeys(value, ["type", "message"])) {
      return { ok: false, reason: "validation_error" };
    }
    return { ok: true, value: { type: "chat", message } };
  }

  if (type === "tasks") {
    if (!hasOnlyKeys(value, ["type", "message", "tasks"])) {
      return { ok: false, reason: "validation_error" };
    }

    const tasks = parseTasks(value.tasks);
    if (tasks === null) {
      return { ok: false, reason: "validation_error" };
    }
    return { ok: true, value: { type: "tasks", message, tasks } };
  }

  return { ok: false, reason: "validation_error" };
}

/** 상태 코드까지 포함해 공개 오류 응답을 검증한다. */
export function parseErrorResponse(
  value: unknown,
  status: number,
): ParseResult<ErrorResponse> {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["error"]) ||
    !isRecord(value.error) ||
    !hasOnlyKeys(value.error, ["code", "message", "request_id"])
  ) {
    return { ok: false, reason: "validation_error" };
  }

  const code =
    typeof value.error.code === "string"
      ? value.error.code.trim()
      : value.error.code;
  const requestId = parseUuid(value.error.request_id);
  if (
    !isErrorCode(code) ||
    ERROR_STATUS_BY_CODE[code] !== status ||
    requestId === null
  ) {
    return { ok: false, reason: "validation_error" };
  }

  const message = parseTrimmedString(
    value.error.message,
    CHAT_LIMITS.errorMessage,
  );
  if (message === null) {
    return { ok: false, reason: "validation_error" };
  }

  return {
    ok: true,
    value: {
      error: {
        code,
        message,
        request_id: requestId,
      },
    },
  };
}

/** AI 서버가 반환할 수 있는 오류 응답만 검증한다. */
export function parseAiErrorResponse(
  value: unknown,
  status: number,
): ParseResult<ErrorResponse> {
  const result = parseErrorResponse(value, status);
  if (
    !result.ok ||
    !AI_ERROR_CODES.has(result.value.error.code as AiErrorCode)
  ) {
    return { ok: false, reason: "validation_error" };
  }
  return result;
}
