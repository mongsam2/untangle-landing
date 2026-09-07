import { describe, expect, test } from "bun:test";

import {
  DEMO_STORAGE_KEY,
  INITIAL_GREETING,
  createInitialDemoState,
  demoStateReducer,
  isTaskCompleted,
  loadStoredDemoState,
  parseStoredDemoState,
  prepareChatRequest,
  reconcileCompletedIds,
  saveStoredDemoState,
  toStoredDemoState,
  trimMessagesForRequest,
} from "@/components/demo/state";
import type {
  DemoAction,
  DemoRuntimeState,
  StoredDemoState,
  StoredMessage,
} from "@/components/demo/types";
import { CHAT_LIMITS, jsonByteLength } from "@/lib/chat/contract";
import type { ChatSuccessResponse, Task } from "@/lib/chat/types";

/**
 * v2 데모 저장, 대화 정리, 완료 조정과 직접 편집 상태 전환을 검증한다.
 */

function uuid(index: number): string {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

const MESSAGE_ID = uuid(1);
const USER_ID = uuid(2);
const RESPONSE_ID = uuid(3);
const ATTEMPT_ID = uuid(4);
const RETRY_ATTEMPT_ID = uuid(5);
const TASK_ID = uuid(101);
const OTHER_TASK_ID = uuid(102);
const SUBTASK_ID = uuid(201);
const OTHER_SUBTASK_ID = uuid(202);

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: TASK_ID,
    title: "논문 초안 작성하기",
    description: "모아둔 자료로 첫 초안을 만들어요.",
    subtasks: [],
    ...overrides,
  };
}

function hydratedState(
  overrides: Partial<DemoRuntimeState> = {},
): DemoRuntimeState {
  const initial = createInitialDemoState(MESSAGE_ID);
  const hydrated = demoStateReducer(initial, { type: "hydrate", stored: null });
  return { ...hydrated, ...overrides };
}

function pendingState(
  state: DemoRuntimeState = hydratedState(),
): DemoRuntimeState {
  return demoStateReducer(state, {
    type: "submitUserMessage",
    id: USER_ID,
    attemptId: ATTEMPT_ID,
    content: "논문이 신경 쓰여",
  });
}

function storedState(
  overrides: Partial<StoredDemoState> = {},
): StoredDemoState {
  return {
    version: 2,
    messages: [
      { id: MESSAGE_ID, role: "assistant", content: INITIAL_GREETING },
    ],
    tasks: [],
    completedIds: [],
    todayUnread: false,
    historyTrimmed: false,
    ...overrides,
  };
}

class MemoryStorage {
  values = new Map<string, string>();
  writes = 0;
  failRead = false;
  failWrite = false;

  getItem(key: string): string | null {
    if (this.failRead) throw new Error("read failed");
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrite) throw new Error("write failed");
    this.writes += 1;
    this.values.set(key, value);
  }
}

describe("v2 저장 검증과 복원", () => {
  test("새 상태는 첫 인사만 가지고 복원 전에는 저장하지 않는다", () => {
    const storage = new MemoryStorage();
    const state = createInitialDemoState(MESSAGE_ID);

    expect(state.messages).toEqual([
      { id: MESSAGE_ID, role: "assistant", content: INITIAL_GREETING },
    ]);
    expect(state.hydrated).toBe(false);
    expect(state.activeTab).toBe("chat");
    expect(saveStoredDemoState(state, storage)).toBe(false);
    expect(storage.writes).toBe(0);
  });

  test("정상 v2를 공백 정리 후 복원하고 런타임 필드는 저장하지 않는다", () => {
    const parsed = parseStoredDemoState({
      ...storedState(),
      messages: [
        {
          id: ` ${MESSAGE_ID} `,
          role: " assistant ",
          content: "  정리했어요.  ",
          taskSummary: { count: 1, titles: ["  논문 초안  "] },
        },
      ],
      tasks: [task({ title: "  논문 초안  " })],
    });

    expect(parsed?.messages[0]).toEqual({
      id: MESSAGE_ID,
      role: "assistant",
      content: "정리했어요.",
      taskSummary: { count: 1, titles: ["논문 초안"] },
    });
    expect(parsed?.tasks[0]?.title).toBe("논문 초안");

    const runtime = hydratedState({
      tasks: [task()],
      activeTab: "today",
      request: {
        status: "pending",
        errorMessage: null,
        attemptId: ATTEMPT_ID,
      },
    });
    expect(toStoredDemoState(runtime)).toEqual({
      version: 2,
      messages: runtime.messages,
      tasks: runtime.tasks,
      completedIds: [],
      todayUnread: false,
      historyTrimmed: false,
    });
  });

  test("v1, 알 수 없는 필드와 손상된 중첩 값은 전체를 버린다", () => {
    expect(parseStoredDemoState({ ...storedState(), version: 1 })).toBeNull();
    expect(
      parseStoredDemoState({ ...storedState(), activeTab: "today" }),
    ).toBeNull();
    expect(
      parseStoredDemoState(
        storedState({
          messages: [
            {
              id: MESSAGE_ID,
              role: "user",
              content: "내용",
              taskSummary: { count: 0, titles: [] },
            },
          ],
        }),
      ),
    ).toBeNull();
    expect(
      parseStoredDemoState(
        storedState({
          messages: [
            { id: MESSAGE_ID, role: "assistant", content: "내용" },
            { id: MESSAGE_ID.toUpperCase(), role: "user", content: "내용" },
          ],
        }),
      ),
    ).toBeNull();
  });

  test("저장 대화는 역할이 교대해야 하고 정리 뒤 user 시작은 허용한다", () => {
    const repeatedUsers = Array.from(
      { length: CHAT_LIMITS.messages },
      (_, index) => ({
        id: uuid(10_000 + index),
        role: "user" as const,
        content: `질문 ${index}`,
      }),
    );
    expect(
      parseStoredDemoState(storedState({ messages: repeatedUsers })),
    ).toBeNull();

    const userFirst = [
      { id: uuid(11_000), role: "user" as const, content: "질문" },
      { id: uuid(11_001), role: "assistant" as const, content: "답변" },
      { id: uuid(11_002), role: "user" as const, content: "다음 질문" },
    ];
    expect(
      parseStoredDemoState(storedState({ messages: userFirst }))?.messages,
    ).toEqual(userFirst);
  });

  test("잘못된 hydrate 값은 사용 가능한 새 상태로 복구한다", () => {
    const initial = createInitialDemoState(MESSAGE_ID);
    const restored = demoStateReducer(initial, {
      type: "hydrate",
      stored: { version: 1 } as unknown as StoredDemoState,
    });

    expect(restored.hydrated).toBe(true);
    expect(restored.activeTab).toBe("chat");
    expect(restored.request).toEqual({ status: "idle", errorMessage: null });
    expect(restored.messages).toEqual(initial.messages);
  });

  test("완료 ID는 현재 leaf 항목만 중복 없이 허용한다", () => {
    const parent = task({
      subtasks: [{ id: SUBTASK_ID, title: "파일 열기" }],
    });
    expect(
      parseStoredDemoState(
        storedState({ tasks: [parent], completedIds: [SUBTASK_ID] }),
      )?.completedIds,
    ).toEqual([SUBTASK_ID]);
    expect(
      parseStoredDemoState(
        storedState({ tasks: [parent], completedIds: [TASK_ID] }),
      ),
    ).toBeNull();
    expect(
      parseStoredDemoState(
        storedState({
          tasks: [parent],
          completedIds: [SUBTASK_ID, SUBTASK_ID.toUpperCase()],
        }),
      ),
    ).toBeNull();
    expect(
      parseStoredDemoState(
        storedState({ tasks: [parent], completedIds: [OTHER_SUBTASK_ID] }),
      ),
    ).toBeNull();
  });

  test("새 키만 읽고 손상·접근 실패에는 메모리 사용을 계속할 수 있게 null을 준다", () => {
    const storage = new MemoryStorage();
    storage.values.set("untangle:demo:v1", JSON.stringify({ version: 1 }));
    expect(loadStoredDemoState(storage)).toBeNull();

    storage.values.set(DEMO_STORAGE_KEY, "{broken");
    expect(loadStoredDemoState(storage)).toBeNull();

    storage.failRead = true;
    expect(loadStoredDemoState(storage)).toBeNull();
  });

  test("복원 뒤에만 저장하고 쓰기 실패는 데모 상태를 막지 않는다", () => {
    const storage = new MemoryStorage();
    const state = hydratedState();
    expect(saveStoredDemoState(state, storage)).toBe(true);
    expect(loadStoredDemoState(storage)).toEqual(toStoredDemoState(state));

    storage.failWrite = true;
    expect(saveStoredDemoState(state, storage)).toBe(false);
  });

  test("마지막 user를 복원하면 대화 탭의 응답 재시도 상태로 연다", () => {
    const initial = createInitialDemoState(uuid(10));
    const restored = demoStateReducer(initial, {
      type: "hydrate",
      stored: storedState({
        messages: [{ id: USER_ID, role: "user", content: "계속해 줘" }],
        todayUnread: true,
      }),
    });

    expect(restored.activeTab).toBe("chat");
    expect(restored.request).toEqual({
      status: "retry",
      errorMessage: null,
      previousAttemptId: null,
    });
    expect(restored.todayUnread).toBe(true);
  });
});

describe("대화 추가, 정리와 재시도", () => {
  test("사용자 메시지는 한 번만 추가하고 실패·재시도 때 중복하지 않는다", () => {
    const submitted = pendingState();
    expect(submitted.messages.at(-1)).toEqual({
      id: USER_ID,
      role: "user",
      content: "논문이 신경 쓰여",
    });
    expect(submitted.request.status).toBe("pending");

    const failed = demoStateReducer(submitted, {
      type: "failRequest",
      attemptId: ATTEMPT_ID,
      message: "  잠시 후 다시 해주세요.  ",
    });
    expect(failed.messages).toEqual(submitted.messages);
    expect(failed.request).toEqual({
      status: "retry",
      errorMessage: "잠시 후 다시 해주세요.",
      previousAttemptId: ATTEMPT_ID,
    });

    const retried = demoStateReducer(failed, {
      type: "retryRequest",
      attemptId: RETRY_ATTEMPT_ID,
    });
    expect(retried.messages).toEqual(failed.messages);
    expect(retried.request.status).toBe("pending");
  });

  test("재시도 전 요청의 늦은 성공과 실패를 무시한다", () => {
    const submitted = pendingState();
    const failed = demoStateReducer(submitted, {
      type: "failRequest",
      attemptId: ATTEMPT_ID,
    });
    expect(
      demoStateReducer(failed, {
        type: "retryRequest",
        attemptId: ATTEMPT_ID,
      }),
    ).toBe(failed);
    const retried = demoStateReducer(failed, {
      type: "retryRequest",
      attemptId: RETRY_ATTEMPT_ID,
    });

    const staleSuccess = demoStateReducer(retried, {
      type: "receiveResponse",
      id: RESPONSE_ID,
      attemptId: ATTEMPT_ID,
      response: { type: "chat", message: "늦은 답변" },
    });
    expect(staleSuccess).toBe(retried);
    expect(
      demoStateReducer(retried, {
        type: "failRequest",
        attemptId: ATTEMPT_ID,
      }),
    ).toBe(retried);

    const current = demoStateReducer(retried, {
      type: "receiveResponse",
      id: RESPONSE_ID,
      attemptId: RETRY_ATTEMPT_ID,
      response: { type: "chat", message: "현재 답변" },
    });
    expect(current.request.status).toBe("idle");
    expect(current.messages.at(-1)?.content).toBe("현재 답변");
  });

  test("현재 요청의 잘못된 응답은 pending에 고착되지 않고 재시도로 바뀐다", () => {
    const state = pendingState(hydratedState({ tasks: [task()] }));
    const malformed = demoStateReducer(state, {
      type: "receiveResponse",
      id: RESPONSE_ID,
      attemptId: ATTEMPT_ID,
      response: {
        type: "chat",
        message: "",
      } as ChatSuccessResponse,
    });

    expect(malformed.request).toEqual({
      status: "retry",
      errorMessage: "응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.",
      previousAttemptId: ATTEMPT_ID,
    });
    expect(malformed.messages).toEqual(state.messages);
    expect(malformed.tasks).toEqual(state.tasks);
  });

  test("복원한 마지막 user는 중복 없이 실제 재시도 요청으로 바뀐다", () => {
    const initial = createInitialDemoState(MESSAGE_ID);
    const restored = demoStateReducer(initial, {
      type: "hydrate",
      stored: storedState({
        messages: [{ id: USER_ID, role: "user", content: "계속해 줘" }],
      }),
    });
    const retried = demoStateReducer(restored, {
      type: "retryRequest",
      attemptId: RETRY_ATTEMPT_ID,
    });

    expect(retried.request.status).toBe("pending");
    expect(retried.messages).toHaveLength(1);
    expect(prepareChatRequest(retried).ok).toBe(true);
  });

  test("63개와 정확한 256 KiB는 유지하고 초과분만 오래된 대화부터 정리한다", () => {
    const messages = Array.from({ length: 63 }, (_, index): StoredMessage => ({
      id: uuid(12_000 + index),
      role: index % 2 === 0 ? "user" : "assistant",
      content: index < 62 ? "가".repeat(1_350) : "x",
    }));
    const currentBytes = jsonByteLength({
      messages: messages.map(({ role, content }) => ({ role, content })),
      tasks: [],
    });
    const missingBytes = CHAT_LIMITS.bodyBytes - currentBytes;
    expect(missingBytes).toBeGreaterThan(0);
    expect(missingBytes).toBeLessThanOrEqual(11_997);
    messages[62]!.content =
      "x" +
      "가".repeat(Math.floor(missingBytes / 3)) +
      "x".repeat(missingBytes % 3);

    const exact = trimMessagesForRequest(messages, []);
    expect(prepareChatRequest(hydratedState({ messages })).ok).toBe(true);
    expect(
      jsonByteLength({
        messages: messages.map(({ role, content }) => ({ role, content })),
        tasks: [],
      }),
    ).toBe(CHAT_LIMITS.bodyBytes);
    expect(exact).toEqual({ messages, didTrim: false, canSend: true });

    const over = messages.map((message) => ({ ...message }));
    over[62]!.content += "x";
    const trimmed = trimMessagesForRequest(over, []);
    expect(trimmed.canSend).toBe(true);
    expect(trimmed.didTrim).toBe(true);
    expect(trimmed.messages.at(-1)?.id).toBe(over.at(-1)?.id);
    expect(trimmed.messages.some((message) => message.id === over[0]?.id)).toBe(
      false,
    );
  });

  test("64번째 user를 더하면 첫 인사부터 제거해 응답 자리 63개를 남긴다", () => {
    const messages: StoredMessage[] = [
      { id: uuid(1000), role: "assistant", content: INITIAL_GREETING },
    ];
    for (let index = 0; index < 31; index += 1) {
      messages.push(
        { id: uuid(1001 + index * 2), role: "user", content: `질문 ${index}` },
        {
          id: uuid(1002 + index * 2),
          role: "assistant",
          content: `답변 ${index}`,
        },
      );
    }
    messages.push({ id: uuid(2000), role: "user", content: "최신 질문" });

    const trimmed = trimMessagesForRequest(messages, []);
    expect(trimmed.canSend).toBe(true);
    expect(trimmed.didTrim).toBe(true);
    expect(trimmed.messages).toHaveLength(63);
    expect(trimmed.messages.at(-1)?.content).toBe("최신 질문");
    expect(
      trimmed.messages.some((message) => message.content === INITIAL_GREETING),
    ).toBe(false);

    const submitted = demoStateReducer(
      hydratedState({ messages: messages.slice(0, -1) }),
      {
        type: "submitUserMessage",
        id: uuid(2_001),
        attemptId: ATTEMPT_ID,
        content: "최신 질문",
      },
    );
    expect(submitted.messages).toHaveLength(63);
    expect(submitted.historyTrimmed).toBe(true);
    expect(submitted.messages.at(-1)?.content).toBe("최신 질문");
  });

  test("256 KiB를 넘으면 오래된 완결 대화부터 지우고 최신 user를 보존한다", () => {
    const messages: StoredMessage[] = [];
    for (let index = 0; index < 31; index += 1) {
      messages.push(
        {
          id: uuid(3000 + index * 2),
          role: "user",
          content: "🙂".repeat(CHAT_LIMITS.messageContent),
        },
        {
          id: uuid(3001 + index * 2),
          role: "assistant",
          content: "🙂".repeat(CHAT_LIMITS.messageContent),
        },
      );
    }
    messages.push({ id: uuid(4000), role: "user", content: "최신 질문" });

    const trimmed = trimMessagesForRequest(messages, []);
    expect(trimmed.canSend).toBe(true);
    expect(trimmed.didTrim).toBe(true);
    expect(trimmed.messages.at(-1)?.content).toBe("최신 질문");
    expect(
      jsonByteLength({
        messages: trimmed.messages.map(({ role, content }) => ({
          role,
          content,
        })),
        tasks: [],
      }),
    ).toBeLessThanOrEqual(CHAT_LIMITS.bodyBytes);
  });

  test("최신 user만으로 보낼 수 없으면 입력 축소 오류를 유지한다", () => {
    const oversized = [
      {
        id: USER_ID,
        role: "user" as const,
        content: "🙂".repeat(100_000),
      },
    ];
    const trimmed = trimMessagesForRequest(oversized, []);
    expect(trimmed.canSend).toBe(false);
    expect(trimmed.messages).toEqual(oversized);

    const invalidState = hydratedState({ messages: oversized });
    expect(prepareChatRequest(invalidState)).toEqual({
      ok: false,
      reason: "request_too_large",
    });
  });

  test("전송 요청에서 로컬 ID, 요약과 완료 상태를 제외한다", () => {
    const state = hydratedState({
      messages: [
        {
          id: MESSAGE_ID,
          role: "assistant",
          content: "정리했어요.",
          taskSummary: { count: 1, titles: ["논문"] },
        },
        { id: USER_ID, role: "user", content: "계속해 줘" },
      ],
      tasks: [task()],
      completedIds: [TASK_ID],
    });
    const prepared = prepareChatRequest(state);
    expect(prepared).toEqual({
      ok: true,
      request: {
        messages: [
          { role: "assistant", content: "정리했어요." },
          { role: "user", content: "계속해 줘" },
        ],
        tasks: [task()],
      },
    });
  });
});

describe("AI 응답과 완료 상태 조정", () => {
  test("63개 pending 대화에 assistant를 더한 64개 상태를 저장하고 복원한다", () => {
    const messages = Array.from({ length: 63 }, (_, index): StoredMessage => ({
      id: uuid(13_000 + index),
      role: index % 2 === 0 ? "user" : "assistant",
      content: `메시지 ${index}`,
    }));
    const state = hydratedState({
      messages,
      request: {
        status: "pending",
        errorMessage: null,
        attemptId: ATTEMPT_ID,
      },
    });
    const received = demoStateReducer(state, {
      type: "receiveResponse",
      id: RESPONSE_ID,
      attemptId: ATTEMPT_ID,
      response: { type: "chat", message: "마지막 답변" },
    });

    expect(received.messages).toHaveLength(CHAT_LIMITS.messages);
    expect(received.request.status).toBe("idle");
    expect(parseStoredDemoState(toStoredDemoState(received))).not.toBeNull();
  });

  test("chat 응답은 목록과 읽지 않음을 바꾸지 않는다", () => {
    const state = pendingState(
      hydratedState({ tasks: [task()], todayUnread: true }),
    );
    const next = demoStateReducer(state, {
      type: "receiveResponse",
      id: RESPONSE_ID,
      attemptId: ATTEMPT_ID,
      response: { type: "chat", message: "어디까지 진행했어요?" },
    });

    expect(next.tasks).toEqual(state.tasks);
    expect(next.todayUnread).toBe(true);
    expect(next.messages.at(-1)?.content).toBe("어디까지 진행했어요?");
    expect(next.request.status).toBe("idle");
  });

  test("tasks 응답은 전체 목록과 당시 요약을 저장하고 오늘 표시를 켠다", () => {
    const state = pendingState();
    const tasks = [
      task(),
      task({
        id: OTHER_TASK_ID,
        title: "빨래 돌리기",
        description: "세탁물을 모아 돌려요.",
      }),
    ];
    const next = demoStateReducer(state, {
      type: "receiveResponse",
      id: RESPONSE_ID,
      attemptId: ATTEMPT_ID,
      response: { type: "tasks", message: "두 가지로 정리했어요.", tasks },
    });

    expect(next.tasks).toEqual(tasks);
    expect(next.todayUnread).toBe(true);
    expect(next.messages.at(-1)?.taskSummary).toEqual({
      count: 2,
      titles: ["논문 초안 작성하기", "빨래 돌리기"],
    });

    const edited = demoStateReducer(next, {
      type: "updateTask",
      taskId: TASK_ID,
      title: "바뀐 제목",
      description: "바뀐 설명",
    });
    expect(edited.messages.at(-1)?.taskSummary?.titles[0]).toBe(
      "논문 초안 작성하기",
    );
  });

  test("오늘 탭에서 받은 목록은 새 표시 없이 유지되고 탭 이동은 표시를 지운다", () => {
    const state = pendingState(hydratedState({ activeTab: "today" }));
    const received = demoStateReducer(state, {
      type: "receiveResponse",
      id: RESPONSE_ID,
      attemptId: ATTEMPT_ID,
      response: { type: "tasks", message: "정리했어요.", tasks: [task()] },
    });
    expect(received.todayUnread).toBe(false);

    const unread = { ...received, todayUnread: true };
    expect(
      demoStateReducer(unread, { type: "changeTab", tab: "today" }).todayUnread,
    ).toBe(false);
  });

  test("같은 ID 완료는 제목·위치 변경에도 남고 삭제·신규 ID는 정리한다", () => {
    const previous = [
      task(),
      task({ id: OTHER_TASK_ID, title: "빨래", description: "빨래 설명" }),
    ];
    const next = [
      task({
        id: OTHER_TASK_ID,
        title: "빨래 개기",
        description: "바뀐 설명",
      }),
      task({ id: uuid(103), title: "새 일", description: "새 설명" }),
    ];
    expect(
      reconcileCompletedIds(previous, next, [TASK_ID, OTHER_TASK_ID]),
    ).toEqual([OTHER_TASK_ID]);
  });

  test("leaf와 서브태스크 전환에서 부모의 파생 완료 의미를 지킨다", () => {
    const leaf = task();
    const split = task({
      subtasks: [
        { id: SUBTASK_ID, title: "파일 열기" },
        { id: OTHER_SUBTASK_ID, title: "제목 쓰기" },
      ],
    });

    expect(reconcileCompletedIds([leaf], [split], [TASK_ID])).toEqual([]);
    expect(
      reconcileCompletedIds([split], [leaf], [SUBTASK_ID, OTHER_SUBTASK_ID]),
    ).toEqual([TASK_ID]);
    expect(reconcileCompletedIds([split], [leaf], [SUBTASK_ID])).toEqual([]);
  });

  test("요청 중 바꾼 완료 상태를 tasks 응답 뒤 같은 ID에 보존한다", () => {
    const initial = pendingState(hydratedState({ tasks: [task()] }));
    const checked = demoStateReducer(initial, {
      type: "toggleTaskCompletion",
      taskId: TASK_ID,
    });
    const received = demoStateReducer(checked, {
      type: "receiveResponse",
      id: RESPONSE_ID,
      attemptId: ATTEMPT_ID,
      response: {
        type: "tasks",
        message: "제목을 다듬었어요.",
        tasks: [task({ title: "논문 첫 초안 작성하기" })],
      },
    });
    expect(received.completedIds).toEqual([TASK_ID]);
    expect(isTaskCompleted(received.tasks[0]!, received.completedIds)).toBe(
      true,
    );
  });
});

describe("직접 목록 편집과 완료", () => {
  test("큰 할 일을 추가·수정·삭제하고 삭제한 완료 ID도 지운다", () => {
    const state = hydratedState();
    const added = demoStateReducer(state, {
      type: "addTask",
      id: TASK_ID,
      title: "  논문 초안  ",
      description: "  첫 초안을 만들어요.  ",
    });
    expect(added.tasks[0]).toEqual(
      task({ title: "논문 초안", description: "첫 초안을 만들어요." }),
    );

    const updated = demoStateReducer(added, {
      type: "updateTask",
      taskId: TASK_ID,
      title: "논문 개요",
      description: "개요부터 정리해요.",
    });
    expect(updated.tasks[0]?.title).toBe("논문 개요");

    const checked = demoStateReducer(updated, {
      type: "toggleTaskCompletion",
      taskId: TASK_ID,
    });
    const deleted = demoStateReducer(checked, {
      type: "deleteTask",
      taskId: TASK_ID,
    });
    expect(deleted.tasks).toEqual([]);
    expect(deleted.completedIds).toEqual([]);
  });

  test("잘못된 문자열, 중복 ID와 큰 할 일 7개 초과를 만들지 않는다", () => {
    const sevenTasks = Array.from({ length: 7 }, (_, index) =>
      task({ id: uuid(500 + index), subtasks: [] }),
    );
    const state = hydratedState({ tasks: sevenTasks });
    expect(
      demoStateReducer(state, {
        type: "addTask",
        id: uuid(600),
        title: "여덟 번째",
        description: "추가되면 안 돼요.",
      }),
    ).toBe(state);
    const empty = hydratedState();
    expect(
      demoStateReducer(empty, {
        type: "addTask",
        id: TASK_ID,
        title: " ",
        description: "설명",
      }),
    ).toBe(empty);
  });

  test("서브태스크 추가는 완료 leaf를 미완료로 만들고 최대 7개를 지킨다", () => {
    const completedLeaf = hydratedState({
      tasks: [task()],
      completedIds: [TASK_ID],
    });
    const added = demoStateReducer(completedLeaf, {
      type: "addSubtask",
      taskId: TASK_ID,
      id: SUBTASK_ID,
      title: "  파일 열기  ",
    });
    expect(added.tasks[0]?.subtasks).toEqual([
      { id: SUBTASK_ID, title: "파일 열기" },
    ]);
    expect(added.completedIds).toEqual([]);
    expect(isTaskCompleted(added.tasks[0]!, added.completedIds)).toBe(false);

    const seven = task({
      subtasks: Array.from({ length: 7 }, (_, index) => ({
        id: uuid(700 + index),
        title: `단계 ${index}`,
      })),
    });
    const full = hydratedState({ tasks: [seven] });
    expect(
      demoStateReducer(full, {
        type: "addSubtask",
        taskId: TASK_ID,
        id: uuid(800),
        title: "여덟 번째",
      }),
    ).toBe(full);
  });

  test("서브태스크를 수정·재정렬·삭제하고 마지막 삭제 때 완료 부모를 leaf로 옮긴다", () => {
    const split = task({
      subtasks: [
        { id: SUBTASK_ID, title: "파일 열기" },
        { id: OTHER_SUBTASK_ID, title: "제목 쓰기" },
      ],
    });
    const state = hydratedState({
      tasks: [split],
      completedIds: [SUBTASK_ID, OTHER_SUBTASK_ID],
    });
    const updated = demoStateReducer(state, {
      type: "updateSubtask",
      taskId: TASK_ID,
      subtaskId: SUBTASK_ID,
      title: "문서 열기",
    });
    const reordered = demoStateReducer(updated, {
      type: "reorderSubtask",
      taskId: TASK_ID,
      subtaskId: OTHER_SUBTASK_ID,
      overSubtaskId: SUBTASK_ID,
    });
    expect(reordered.tasks[0]?.subtasks.map((item) => item.id)).toEqual([
      OTHER_SUBTASK_ID,
      SUBTASK_ID,
    ]);

    const one = demoStateReducer(reordered, {
      type: "deleteSubtask",
      taskId: TASK_ID,
      subtaskId: OTHER_SUBTASK_ID,
    });
    const leaf = demoStateReducer(one, {
      type: "deleteSubtask",
      taskId: TASK_ID,
      subtaskId: SUBTASK_ID,
    });
    expect(leaf.tasks[0]?.subtasks).toEqual([]);
    expect(leaf.completedIds).toEqual([TASK_ID]);
  });

  test("부모 완료는 모든 자식을 전환하고 자식 전체 완료가 부모 완료다", () => {
    const split = task({
      subtasks: [
        { id: SUBTASK_ID, title: "파일 열기" },
        { id: OTHER_SUBTASK_ID, title: "제목 쓰기" },
      ],
    });
    const state = hydratedState({ tasks: [split] });
    const allDone = demoStateReducer(state, {
      type: "toggleTaskCompletion",
      taskId: TASK_ID,
    });
    expect(allDone.completedIds).toEqual([SUBTASK_ID, OTHER_SUBTASK_ID]);
    expect(isTaskCompleted(split, allDone.completedIds)).toBe(true);

    const oneUndone = demoStateReducer(allDone, {
      type: "toggleSubtaskCompletion",
      taskId: TASK_ID,
      subtaskId: SUBTASK_ID,
    });
    expect(isTaskCompleted(split, oneUndone.completedIds)).toBe(false);
    expect(oneUndone.completedIds).toEqual([OTHER_SUBTASK_ID]);
  });

  test("완료 전환은 새 그룹 끝으로 옮기고 다른 그룹 재정렬은 막는다", () => {
    const first = task();
    const second = task({
      id: OTHER_TASK_ID,
      title: "빨래",
      description: "빨래 설명",
    });
    const third = task({
      id: uuid(103),
      title: "메일",
      description: "메일 설명",
    });
    const state = hydratedState({ tasks: [first, second, third] });
    const completed = demoStateReducer(state, {
      type: "toggleTaskCompletion",
      taskId: first.id,
    });
    expect(completed.tasks.map((item) => item.id)).toEqual([
      second.id,
      third.id,
      first.id,
    ]);

    const blocked = demoStateReducer(completed, {
      type: "reorderTask",
      taskId: first.id,
      overTaskId: second.id,
    });
    expect(blocked).toBe(completed);

    const reordered = demoStateReducer(completed, {
      type: "reorderTask",
      taskId: third.id,
      overTaskId: second.id,
    });
    expect(reordered.tasks.map((item) => item.id)).toEqual([
      third.id,
      second.id,
      first.id,
    ]);
  });

  test("요청 중 내용 편집은 잠그고 완료 체크는 허용한다", () => {
    const state = pendingState(
      hydratedState({
        tasks: [
          task({
            subtasks: [
              { id: SUBTASK_ID, title: "파일 열기" },
              { id: OTHER_SUBTASK_ID, title: "제목 쓰기" },
            ],
          }),
          task({
            id: OTHER_TASK_ID,
            title: "빨래",
            description: "빨래 설명",
          }),
        ],
      }),
    );
    const lockedActions: DemoAction[] = [
      {
        type: "addTask",
        id: uuid(900),
        title: "새 일",
        description: "새 설명",
      },
      {
        type: "updateTask",
        taskId: TASK_ID,
        title: "바뀌면 안 됨",
        description: "바뀌면 안 됨",
      },
      { type: "deleteTask", taskId: TASK_ID },
      {
        type: "reorderTask",
        taskId: TASK_ID,
        overTaskId: OTHER_TASK_ID,
      },
      {
        type: "addSubtask",
        taskId: TASK_ID,
        id: uuid(901),
        title: "새 단계",
      },
      {
        type: "updateSubtask",
        taskId: TASK_ID,
        subtaskId: SUBTASK_ID,
        title: "바뀌면 안 됨",
      },
      {
        type: "deleteSubtask",
        taskId: TASK_ID,
        subtaskId: SUBTASK_ID,
      },
      {
        type: "reorderSubtask",
        taskId: TASK_ID,
        subtaskId: SUBTASK_ID,
        overSubtaskId: OTHER_SUBTASK_ID,
      },
    ];
    for (const action of lockedActions) {
      expect(demoStateReducer(state, action)).toBe(state);
    }

    const checked = demoStateReducer(state, {
      type: "toggleTaskCompletion",
      taskId: TASK_ID,
    });
    expect(checked.completedIds).toEqual([SUBTASK_ID, OTHER_SUBTASK_ID]);

    const subtaskChecked = demoStateReducer(state, {
      type: "toggleSubtaskCompletion",
      taskId: TASK_ID,
      subtaskId: SUBTASK_ID,
    });
    expect(subtaskChecked.completedIds).toEqual([SUBTASK_ID]);
  });
});
