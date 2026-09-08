import { arrayMove } from "@dnd-kit/helpers";
import type {
  DemoAction,
  DemoRuntimeState,
  StoredDemoState,
  StoredMessage,
  TaskSummary,
} from "@/components/demo/types";
import {
  CHAT_LIMITS,
  hasOnlyKeys,
  isRecord,
  isUuid,
  jsonByteLength,
  parseChatRequest,
  parseChatSuccessResponse,
  parseTrimmedString,
  toChatRequest,
} from "@/lib/chat/contract";
import type { ChatRequest, Task } from "@/lib/chat/types";

/**
 * 대화형 데모의 복원, 대화 정리, 완료 조정과 직접 편집을 담당한다.
 * 브라우저 저장소는 주입 가능하게 두어 상태 전환을 결정론적으로 검증한다.
 */

export const DEMO_STORAGE_KEY = "untangle:demo:v2";
export const INITIAL_GREETING =
  "안녕하세요. 요즘 머릿속을 복잡하게 만드는 일이 있나요?";
export const RETRY_MESSAGE =
  "응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.";
export const REQUEST_TOO_LARGE_MESSAGE =
  "한 번에 보낼 내용이 너무 많아요. 입력을 줄여 주세요.";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_REQUEST_MESSAGES = CHAT_LIMITS.messages - 1;

export interface DemoStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type PreparedChatRequest =
  | { ok: true; request: ChatRequest }
  | { ok: false; reason: "invalid_state" | "request_too_large" };

/** 브라우저에서 만든 식별자가 UUIDv4인지 확인한다. */
export function isUuidV4(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_PATTERN.test(value.trim());
}

function parseTaskSummary(value: unknown): TaskSummary | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["count", "titles"]) ||
    typeof value.count !== "number" ||
    !Number.isInteger(value.count) ||
    value.count < 0 ||
    value.count > CHAT_LIMITS.tasks ||
    !Array.isArray(value.titles) ||
    value.titles.length > 3 ||
    value.titles.length > value.count
  ) {
    return null;
  }
  const titles: string[] = [];
  for (const candidate of value.titles) {
    const title = parseTrimmedString(candidate, CHAT_LIMITS.taskTitle);
    if (!title) return null;
    titles.push(title);
  }
  return { count: value.count, titles };
}

function parseStoredMessage(value: unknown): StoredMessage | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["id", "role", "content", "taskSummary"])
  ) {
    return null;
  }
  const id = typeof value.id === "string" ? value.id.trim() : value.id;
  const role = typeof value.role === "string" ? value.role.trim() : value.role;
  const content = parseTrimmedString(value.content, CHAT_LIMITS.messageContent);
  if (!isUuidV4(id) || (role !== "user" && role !== "assistant") || !content) {
    return null;
  }
  if (!Object.hasOwn(value, "taskSummary")) return { id, role, content };
  if (role !== "assistant") return null;
  const taskSummary = parseTaskSummary(value.taskSummary);
  return taskSummary ? { id, role, content, taskSummary } : null;
}

function normalizeTasks(value: unknown): Task[] | null {
  const result = parseChatSuccessResponse(
    { type: "tasks", message: "목록", tasks: value },
    200,
  );
  return result.ok && result.value.type === "tasks" ? result.value.tasks : null;
}

function allItemIds(tasks: readonly Task[]): Map<string, string> {
  const ids = new Map<string, string>();
  for (const task of tasks) {
    ids.set(task.id.toLowerCase(), task.id);
    for (const subtask of task.subtasks) {
      ids.set(subtask.id.toLowerCase(), subtask.id);
    }
  }
  return ids;
}

function parseCompletedIds(
  value: unknown,
  tasks: readonly Task[],
): string[] | null {
  if (!Array.isArray(value)) return null;
  const ids = allItemIds(tasks);
  const nonLeafParents = new Set(
    tasks
      .filter((task) => task.subtasks.length > 0)
      .map((task) => task.id.toLowerCase()),
  );
  const seen = new Set<string>();
  const completedIds: string[] = [];
  for (const candidate of value) {
    if (typeof candidate !== "string") return null;
    const id = candidate.trim();
    const key = id.toLowerCase();
    if (
      !isUuid(id) ||
      seen.has(key) ||
      nonLeafParents.has(key) ||
      !ids.has(key)
    ) {
      return null;
    }
    seen.add(key);
    completedIds.push(ids.get(key)!);
  }
  return completedIds;
}

/** 알 수 없는 필드를 포함한 v2 저장 스냅샷을 전체 단위로 거절한다. */
export function parseStoredDemoState(value: unknown): StoredDemoState | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "version",
      "messages",
      "tasks",
      "completedIds",
      "todayUnread",
      "historyTrimmed",
    ]) ||
    value.version !== 2 ||
    !Array.isArray(value.messages) ||
    value.messages.length === 0 ||
    value.messages.length > CHAT_LIMITS.messages ||
    typeof value.todayUnread !== "boolean" ||
    typeof value.historyTrimmed !== "boolean"
  ) {
    return null;
  }
  const messages: StoredMessage[] = [];
  const messageIds = new Set<string>();
  for (const candidate of value.messages) {
    const message = parseStoredMessage(candidate);
    const key = message?.id.toLowerCase();
    if (!message || !key || messageIds.has(key)) return null;
    messageIds.add(key);
    messages.push(message);
  }
  for (let index = 1; index < messages.length; index += 1) {
    if (messages[index - 1]?.role === messages[index]?.role) return null;
  }
  const tasks = normalizeTasks(value.tasks);
  if (!tasks) return null;
  const completedIds = parseCompletedIds(value.completedIds, tasks);
  if (!completedIds) return null;
  return {
    version: 2,
    messages,
    tasks,
    completedIds,
    todayUnread: value.todayUnread,
    historyTrimmed: value.historyTrimmed,
  };
}

function cloneTasks(tasks: readonly Task[]): Task[] {
  return tasks.map((task) => ({
    ...task,
    subtasks: task.subtasks.map((subtask) => ({ ...subtask })),
  }));
}

function cloneMessages(messages: readonly StoredMessage[]): StoredMessage[] {
  return messages.map((message) => ({
    ...message,
    ...(message.taskSummary
      ? {
          taskSummary: {
            count: message.taskSummary.count,
            titles: [...message.taskSummary.titles],
          },
        }
      : {}),
  }));
}

/** 런타임 전용 필드를 제외한 저장 스냅샷을 만든다. */
export function toStoredDemoState(state: DemoRuntimeState): StoredDemoState {
  return {
    version: 2,
    messages: cloneMessages(state.messages),
    tasks: cloneTasks(state.tasks),
    completedIds: [...state.completedIds],
    todayUnread: state.todayUnread,
    historyTrimmed: state.historyTrimmed,
  };
}

function browserStorage(): DemoStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** 새 v2 키만 읽고, 접근 실패나 손상된 값에는 null을 반환한다. */
export function loadStoredDemoState(
  storage: DemoStorage | null = browserStorage(),
): StoredDemoState | null {
  try {
    const raw = storage?.getItem(DEMO_STORAGE_KEY);
    return raw ? parseStoredDemoState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** 복원이 끝난 유효 상태만 v2 키에 저장하고 성공 여부를 반환한다. */
export function saveStoredDemoState(
  state: DemoRuntimeState,
  storage: DemoStorage | null = browserStorage(),
): boolean {
  if (!state.hydrated || !storage) return false;
  const snapshot = parseStoredDemoState(toStoredDemoState(state));
  if (!snapshot) return false;
  try {
    storage.setItem(DEMO_STORAGE_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

/** 첫 인사를 가진 아직 복원되지 않은 런타임 상태를 만든다. */
export function createInitialDemoState(messageId: string): DemoRuntimeState {
  const message = parseStoredMessage({
    id: messageId,
    role: "assistant",
    content: INITIAL_GREETING,
  });
  if (!message) throw new TypeError("첫 메시지 ID는 UUIDv4여야 해요.");
  return {
    version: 2,
    messages: [message],
    tasks: [],
    completedIds: [],
    todayUnread: false,
    historyTrimmed: false,
    activeTab: "chat",
    request: { status: "idle", errorMessage: null },
    hydrated: false,
  };
}

function runtimeFromStored(stored: StoredDemoState): DemoRuntimeState {
  return {
    ...stored,
    messages: cloneMessages(stored.messages),
    tasks: cloneTasks(stored.tasks),
    completedIds: [...stored.completedIds],
    activeTab: "chat",
    request:
      stored.messages.at(-1)?.role === "user"
        ? {
            status: "retry",
            errorMessage: null,
            previousAttemptId: null,
          }
        : { status: "idle", errorMessage: null },
    hydrated: true,
  };
}

function removeOldestConversation(messages: StoredMessage[]): boolean {
  if (messages.length <= 1) return false;
  if (messages[0]?.role === "assistant") {
    messages.splice(0, 1);
    return true;
  }
  for (let index = 0; index + 1 < messages.length - 1; index += 1) {
    if (
      messages[index]?.role === "user" &&
      messages[index + 1]?.role === "assistant"
    ) {
      messages.splice(index, 2);
      return true;
    }
  }
  return false;
}

function requestIsValid(
  messages: readonly StoredMessage[],
  tasks: readonly Task[],
): boolean {
  if (messages.length > MAX_REQUEST_MESSAGES) return false;
  const request = toChatRequest(messages, tasks);
  return (
    jsonByteLength(request) <= CHAT_LIMITS.bodyBytes &&
    parseChatRequest(request).ok
  );
}

/** 응답 한 자리를 남기며 가장 오래된 완결 대화부터 요청 크기를 줄인다. */
export function trimMessagesForRequest(
  messages: readonly StoredMessage[],
  tasks: readonly Task[],
): { messages: StoredMessage[]; didTrim: boolean; canSend: boolean } {
  const next = cloneMessages(messages);
  let didTrim = false;
  while (!requestIsValid(next, tasks)) {
    if (!removeOldestConversation(next)) break;
    didTrim = true;
  }
  return { messages: next, didTrim, canSend: requestIsValid(next, tasks) };
}

/** 현재 상태에서 UI 전용 필드를 뺀 전송 요청을 만든다. */
export function prepareChatRequest(
  state: DemoRuntimeState,
): PreparedChatRequest {
  const request = toChatRequest(state.messages, state.tasks);
  if (jsonByteLength(request) > CHAT_LIMITS.bodyBytes) {
    return { ok: false, reason: "request_too_large" };
  }
  if (
    state.messages.length > MAX_REQUEST_MESSAGES ||
    !parseChatRequest(request).ok
  ) {
    return { ok: false, reason: "invalid_state" };
  }
  return { ok: true, request };
}

function completedSet(completedIds: readonly string[]): Set<string> {
  return new Set(completedIds.map((id) => id.toLowerCase()));
}

/** 서브태스크가 있는 부모는 자식 전체로, leaf 부모는 자신의 ID로 완료를 판단한다. */
export function isTaskCompleted(
  task: Task,
  completedIds: readonly string[],
): boolean {
  const completed = completedSet(completedIds);
  return task.subtasks.length > 0
    ? task.subtasks.every((subtask) => completed.has(subtask.id.toLowerCase()))
    : completed.has(task.id.toLowerCase());
}

function canonicalCompletedIds(
  tasks: readonly Task[],
  completed: ReadonlySet<string>,
): string[] {
  const ids: string[] = [];
  for (const task of tasks) {
    if (task.subtasks.length === 0) {
      if (completed.has(task.id.toLowerCase())) ids.push(task.id);
    } else {
      for (const subtask of task.subtasks) {
        if (completed.has(subtask.id.toLowerCase())) ids.push(subtask.id);
      }
    }
  }
  return ids;
}

/** 목록 스냅샷 교체 뒤에도 남아 있는 같은 ID의 완료 의미를 보존한다. */
export function reconcileCompletedIds(
  previousTasks: readonly Task[],
  nextTasks: readonly Task[],
  completedIds: readonly string[],
): string[] {
  const nextIds = allItemIds(nextTasks);
  const completed = completedSet(completedIds);
  const reconciled = new Set([...completed].filter((id) => nextIds.has(id)));
  const previousById = new Map(
    previousTasks.map((task) => [task.id.toLowerCase(), task]),
  );

  for (const task of nextTasks) {
    const taskId = task.id.toLowerCase();
    if (task.subtasks.length > 0) {
      reconciled.delete(taskId);
      continue;
    }
    const previous = previousById.get(taskId);
    if (previous?.subtasks.length) {
      if (isTaskCompleted(previous, completedIds)) reconciled.add(taskId);
      else reconciled.delete(taskId);
    }
  }
  return canonicalCompletedIds(nextTasks, reconciled);
}

function findTask(tasks: readonly Task[], id: string): Task | undefined {
  const key = id.toLowerCase();
  return tasks.find((task) => task.id.toLowerCase() === key);
}

function moveTaskToGroupEnd(
  tasks: readonly Task[],
  taskId: string,
  completedIds: readonly string[],
): Task[] {
  const key = taskId.toLowerCase();
  const moved = tasks.find((task) => task.id.toLowerCase() === key);
  if (!moved) return [...tasks];
  const remaining = tasks.filter((task) => task.id.toLowerCase() !== key);
  const incomplete = remaining.filter(
    (task) => !isTaskCompleted(task, completedIds),
  );
  const complete = remaining.filter((task) =>
    isTaskCompleted(task, completedIds),
  );
  (isTaskCompleted(moved, completedIds) ? complete : incomplete).push(moved);
  return [...incomplete, ...complete];
}

function replaceTasks(
  state: DemoRuntimeState,
  value: unknown,
): DemoRuntimeState {
  const tasks = normalizeTasks(value);
  if (!tasks) return state;
  return {
    ...state,
    tasks,
    completedIds: reconcileCompletedIds(state.tasks, tasks, state.completedIds),
    todayUnread: state.activeTab !== "today",
  };
}

function editIsLocked(state: DemoRuntimeState): boolean {
  return state.request.status === "pending";
}

function reorder<T>(items: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length) {
    return [...items];
  }
  return arrayMove([...items], from, to);
}

function applyEditedTasks(
  state: DemoRuntimeState,
  value: Task[],
  movedTaskId?: string,
): DemoRuntimeState {
  const tasks = normalizeTasks(value);
  if (!tasks) return state;
  const before = movedTaskId ? findTask(state.tasks, movedTaskId) : undefined;
  const completedIds = reconcileCompletedIds(
    state.tasks,
    tasks,
    state.completedIds,
  );
  const after = movedTaskId ? findTask(tasks, movedTaskId) : undefined;
  const changedGroup =
    before &&
    after &&
    isTaskCompleted(before, state.completedIds) !==
      isTaskCompleted(after, completedIds);
  return {
    ...state,
    tasks: changedGroup
      ? moveTaskToGroupEnd(tasks, movedTaskId!, completedIds)
      : tasks,
    completedIds,
  };
}

/** 저장·네트워크와 무관하게 데모의 모든 상태 전환을 적용한다. */
export function demoStateReducer(
  state: DemoRuntimeState,
  action: DemoAction,
): DemoRuntimeState {
  switch (action.type) {
    case "hydrate": {
      const stored = action.stored ? parseStoredDemoState(action.stored) : null;
      const fallback = parseStoredDemoState(toStoredDemoState(state));
      if (stored) return runtimeFromStored(stored);
      if (fallback) return runtimeFromStored(fallback);
      return {
        ...state,
        activeTab: "chat",
        request: { status: "idle", errorMessage: null },
        hydrated: true,
      };
    }
    case "submitUserMessage": {
      if (
        !state.hydrated ||
        state.request.status !== "idle" ||
        !isUuidV4(action.attemptId)
      ) {
        return state;
      }
      const message = parseStoredMessage({
        id: action.id,
        role: "user",
        content: action.content,
      });
      if (
        !message ||
        state.messages.some(
          (candidate) =>
            candidate.id.toLowerCase() === message.id.toLowerCase(),
        )
      ) {
        return state;
      }
      const trimmed = trimMessagesForRequest(
        [...state.messages, message],
        state.tasks,
      );
      return {
        ...state,
        messages: trimmed.messages,
        historyTrimmed: state.historyTrimmed || trimmed.didTrim,
        request: trimmed.canSend
          ? {
              status: "pending",
              errorMessage: null,
              attemptId: action.attemptId.trim(),
            }
          : {
              status: "retry",
              errorMessage: REQUEST_TOO_LARGE_MESSAGE,
              previousAttemptId: null,
            },
      };
    }
    case "retryRequest": {
      if (
        state.request.status !== "retry" ||
        state.messages.at(-1)?.role !== "user" ||
        !isUuidV4(action.attemptId) ||
        state.request.previousAttemptId?.toLowerCase() ===
          action.attemptId.trim().toLowerCase()
      ) {
        return state;
      }
      const trimmed = trimMessagesForRequest(state.messages, state.tasks);
      return {
        ...state,
        messages: trimmed.messages,
        historyTrimmed: state.historyTrimmed || trimmed.didTrim,
        request: trimmed.canSend
          ? {
              status: "pending",
              errorMessage: null,
              attemptId: action.attemptId.trim(),
            }
          : {
              status: "retry",
              errorMessage: REQUEST_TOO_LARGE_MESSAGE,
              previousAttemptId: state.request.previousAttemptId,
            },
      };
    }
    case "failRequest":
      return state.request.status === "pending" &&
        isUuidV4(action.attemptId) &&
        state.request.attemptId.toLowerCase() ===
          action.attemptId.trim().toLowerCase()
        ? {
            ...state,
            request: {
              status: "retry",
              errorMessage:
                parseTrimmedString(action.message, CHAT_LIMITS.errorMessage) ??
                RETRY_MESSAGE,
              previousAttemptId: state.request.attemptId,
            },
          }
        : state;
    case "receiveResponse": {
      if (
        state.request.status !== "pending" ||
        !isUuidV4(action.attemptId) ||
        state.request.attemptId.toLowerCase() !==
          action.attemptId.trim().toLowerCase()
      ) {
        return state;
      }
      const responseId =
        typeof action.id === "string" ? action.id.trim() : action.id;
      if (
        !isUuidV4(responseId) ||
        state.messages.some(
          (message) => message.id.toLowerCase() === responseId.toLowerCase(),
        )
      ) {
        return {
          ...state,
          request: {
            status: "retry",
            errorMessage: RETRY_MESSAGE,
            previousAttemptId: state.request.attemptId,
          },
        };
      }
      const parsed = parseChatSuccessResponse(action.response, 200);
      if (!parsed.ok) {
        return {
          ...state,
          request: {
            status: "retry",
            errorMessage: RETRY_MESSAGE,
            previousAttemptId: state.request.attemptId,
          },
        };
      }
      const response = parsed.value;
      const message = parseStoredMessage({
        id: responseId,
        role: "assistant",
        content: response.message,
        ...(response.type === "tasks"
          ? {
              taskSummary: {
                count: response.tasks.length,
                titles: response.tasks.slice(0, 3).map((task) => task.title),
              },
            }
          : {}),
      });
      if (!message || state.messages.length >= CHAT_LIMITS.messages) {
        return {
          ...state,
          request: {
            status: "retry",
            errorMessage: RETRY_MESSAGE,
            previousAttemptId: state.request.attemptId,
          },
        };
      }
      const withMessage: DemoRuntimeState = {
        ...state,
        messages: [...state.messages, message],
        request: { status: "idle", errorMessage: null },
      };
      return response.type === "tasks"
        ? replaceTasks(withMessage, response.tasks)
        : withMessage;
    }
    case "changeTab":
      return {
        ...state,
        activeTab: action.tab,
        todayUnread: action.tab === "today" ? false : state.todayUnread,
      };
    case "addTask": {
      if (editIsLocked(state) || !isUuidV4(action.id)) return state;
      const next = applyEditedTasks(state, [
        ...state.tasks,
        {
          id: action.id.trim(),
          title: action.title,
          description: action.description,
          subtasks: [],
        },
      ]);
      return next === state
        ? state
        : {
            ...next,
            tasks: moveTaskToGroupEnd(next.tasks, action.id, next.completedIds),
          };
    }
    case "updateTask": {
      if (editIsLocked(state) || !findTask(state.tasks, action.taskId)) {
        return state;
      }
      const key = action.taskId.toLowerCase();
      return applyEditedTasks(
        state,
        state.tasks.map((task) =>
          task.id.toLowerCase() === key
            ? {
                ...task,
                title: action.title,
                description: action.description,
              }
            : task,
        ),
      );
    }
    case "deleteTask": {
      if (editIsLocked(state) || !findTask(state.tasks, action.taskId)) {
        return state;
      }
      const key = action.taskId.toLowerCase();
      return applyEditedTasks(
        state,
        state.tasks.filter((task) => task.id.toLowerCase() !== key),
      );
    }
    case "reorderTask": {
      if (editIsLocked(state)) return state;
      const from = state.tasks.findIndex(
        (task) => task.id.toLowerCase() === action.taskId.toLowerCase(),
      );
      const to = state.tasks.findIndex(
        (task) => task.id.toLowerCase() === action.overTaskId.toLowerCase(),
      );
      if (
        from < 0 ||
        to < 0 ||
        from === to ||
        isTaskCompleted(state.tasks[from]!, state.completedIds) !==
          isTaskCompleted(state.tasks[to]!, state.completedIds)
      ) {
        return state;
      }
      return { ...state, tasks: reorder(state.tasks, from, to) };
    }
    case "addSubtask": {
      if (
        editIsLocked(state) ||
        !isUuidV4(action.id) ||
        !findTask(state.tasks, action.taskId)
      ) {
        return state;
      }
      const key = action.taskId.toLowerCase();
      return applyEditedTasks(
        state,
        state.tasks.map((task) =>
          task.id.toLowerCase() === key
            ? {
                ...task,
                subtasks: [
                  ...task.subtasks,
                  { id: action.id.trim(), title: action.title },
                ],
              }
            : task,
        ),
        action.taskId,
      );
    }
    case "updateSubtask": {
      if (editIsLocked(state)) return state;
      const parent = findTask(state.tasks, action.taskId);
      const subtaskKey = action.subtaskId.toLowerCase();
      if (
        !parent?.subtasks.some((item) => item.id.toLowerCase() === subtaskKey)
      ) {
        return state;
      }
      const taskKey = action.taskId.toLowerCase();
      return applyEditedTasks(
        state,
        state.tasks.map((task) =>
          task.id.toLowerCase() === taskKey
            ? {
                ...task,
                subtasks: task.subtasks.map((item) =>
                  item.id.toLowerCase() === subtaskKey
                    ? { ...item, title: action.title }
                    : item,
                ),
              }
            : task,
        ),
      );
    }
    case "deleteSubtask": {
      if (editIsLocked(state)) return state;
      const parent = findTask(state.tasks, action.taskId);
      const subtaskKey = action.subtaskId.toLowerCase();
      if (
        !parent?.subtasks.some((item) => item.id.toLowerCase() === subtaskKey)
      ) {
        return state;
      }
      const taskKey = action.taskId.toLowerCase();
      return applyEditedTasks(
        state,
        state.tasks.map((task) =>
          task.id.toLowerCase() === taskKey
            ? {
                ...task,
                subtasks: task.subtasks.filter(
                  (item) => item.id.toLowerCase() !== subtaskKey,
                ),
              }
            : task,
        ),
        action.taskId,
      );
    }
    case "reorderSubtask": {
      if (editIsLocked(state)) return state;
      const parent = findTask(state.tasks, action.taskId);
      if (!parent) return state;
      const from = parent.subtasks.findIndex(
        (item) => item.id.toLowerCase() === action.subtaskId.toLowerCase(),
      );
      const to = parent.subtasks.findIndex(
        (item) => item.id.toLowerCase() === action.overSubtaskId.toLowerCase(),
      );
      if (from < 0 || to < 0 || from === to) return state;
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === parent.id
            ? { ...task, subtasks: reorder(task.subtasks, from, to) }
            : task,
        ),
      };
    }
    case "toggleTaskCompletion": {
      const task = findTask(state.tasks, action.taskId);
      if (!task) return state;
      const completed = completedSet(state.completedIds);
      const shouldComplete = !isTaskCompleted(task, state.completedIds);
      if (task.subtasks.length === 0) {
        if (shouldComplete) completed.add(task.id.toLowerCase());
        else completed.delete(task.id.toLowerCase());
      } else {
        for (const subtask of task.subtasks) {
          if (shouldComplete) completed.add(subtask.id.toLowerCase());
          else completed.delete(subtask.id.toLowerCase());
        }
        completed.delete(task.id.toLowerCase());
      }
      const completedIds = canonicalCompletedIds(state.tasks, completed);
      return {
        ...state,
        tasks: moveTaskToGroupEnd(state.tasks, task.id, completedIds),
        completedIds,
      };
    }
    case "toggleSubtaskCompletion": {
      const task = findTask(state.tasks, action.taskId);
      const subtask = task?.subtasks.find(
        (item) => item.id.toLowerCase() === action.subtaskId.toLowerCase(),
      );
      if (!task || !subtask) return state;
      const wasCompleted = isTaskCompleted(task, state.completedIds);
      const completed = completedSet(state.completedIds);
      const key = subtask.id.toLowerCase();
      if (completed.has(key)) completed.delete(key);
      else completed.add(key);
      completed.delete(task.id.toLowerCase());
      const completedIds = canonicalCompletedIds(state.tasks, completed);
      return {
        ...state,
        tasks:
          wasCompleted !== isTaskCompleted(task, completedIds)
            ? moveTaskToGroupEnd(state.tasks, task.id, completedIds)
            : state.tasks,
        completedIds,
      };
    }
  }
}
