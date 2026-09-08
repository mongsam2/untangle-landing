import type { ChatSuccessResponse, Task } from "@/lib/chat/types";

/**
 * 대화형 데모의 저장 스냅샷과 화면 런타임 상태를 정의한다.
 * 서버 공개 계약에는 없는 완료·요약·탭 상태를 이 경계에만 둔다.
 */

export type DemoTab = "chat" | "today";

export interface TaskSummary {
  count: number;
  titles: string[];
}

export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  taskSummary?: TaskSummary;
}

export interface StoredDemoState {
  version: 2;
  messages: StoredMessage[];
  tasks: Task[];
  completedIds: string[];
  todayUnread: boolean;
  historyTrimmed: boolean;
}

export type DemoRequestState =
  | { status: "idle"; errorMessage: null }
  | { status: "pending"; errorMessage: null; attemptId: string }
  | {
      status: "retry";
      errorMessage: string | null;
      previousAttemptId: string | null;
    };

export interface DemoRuntimeState extends StoredDemoState {
  activeTab: DemoTab;
  request: DemoRequestState;
  hydrated: boolean;
}

export type DemoAction =
  | { type: "hydrate"; stored: StoredDemoState | null }
  | {
      type: "submitUserMessage";
      id: string;
      attemptId: string;
      content: string;
    }
  | { type: "retryRequest"; attemptId: string }
  | { type: "failRequest"; attemptId: string; message?: string }
  | {
      type: "receiveResponse";
      id: string;
      attemptId: string;
      response: ChatSuccessResponse;
    }
  | { type: "changeTab"; tab: DemoTab }
  | { type: "addTask"; id: string; title: string; description: string }
  | {
      type: "updateTask";
      taskId: string;
      title: string;
      description: string;
    }
  | { type: "deleteTask"; taskId: string }
  | { type: "reorderTask"; taskId: string; overTaskId: string }
  | { type: "addSubtask"; taskId: string; id: string; title: string }
  | {
      type: "updateSubtask";
      taskId: string;
      subtaskId: string;
      title: string;
    }
  | { type: "deleteSubtask"; taskId: string; subtaskId: string }
  | {
      type: "reorderSubtask";
      taskId: string;
      subtaskId: string;
      overSubtaskId: string;
    }
  | { type: "toggleTaskCompletion"; taskId: string }
  | {
      type: "toggleSubtaskCompletion";
      taskId: string;
      subtaskId: string;
    };
