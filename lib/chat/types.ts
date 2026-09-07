/**
 * 랜딩과 AI 서버 사이에서 공유하는 공개 채팅 계약을 정의한다.
 */

export type MessageRole = "user" | "assistant";

export interface Message {
  role: MessageRole;
  content: string;
}

export interface Subtask {
  id: string;
  title: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  subtasks: Subtask[];
}

export interface ChatRequest {
  messages: Message[];
  tasks: Task[];
}

export interface ChatResponse {
  type: "chat";
  message: string;
}

export interface TasksResponse {
  type: "tasks";
  message: string;
  tasks: Task[];
}

export type ChatSuccessResponse = ChatResponse | TasksResponse;

export type AiErrorCode =
  | "invalid_request"
  | "request_too_large"
  | "validation_error"
  | "provider_rate_limited"
  | "provider_error"
  | "model_output_invalid"
  | "provider_not_configured"
  | "provider_timeout"
  | "internal_error";

export type ProxyErrorCode =
  | "invalid_request"
  | "request_too_large"
  | "validation_error"
  | "ai_unavailable"
  | "ai_response_invalid"
  | "ai_not_configured"
  | "ai_timeout";

export type ErrorCode = AiErrorCode | ProxyErrorCode;

export interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    request_id: string;
  };
}
