import type { Provider } from "@/components/split/types";

/**
 * LLM provider resolution shared by /api/split and /api/braindump.
 *
 * 우선순위: 요청 본문의 provider > LLM_PROVIDER 환경 변수 > 키가 있는 쪽
 * 자동 사용(둘 다 있으면 Claude 우선). 명시적으로 고른 공급자의 키가 없으면
 * 다른 쪽으로 조용히 바꾸지 않고 그 키를 안내하는 에러를 돌려준다.
 */

const KEY_GUIDE =
  "프로젝트 루트의 .env.local에 키를 추가한 뒤 개발 서버를 다시 시작해 주세요.";

export function resolveProvider(
  requested?: Provider,
): { provider: Provider } | { error: string } {
  const hasClaude = !!process.env.ANTHROPIC_API_KEY;
  const hasGpt = !!process.env.OPENAI_API_KEY;

  const env = process.env.LLM_PROVIDER?.trim().toLowerCase();
  const pinned =
    requested ??
    (env === "claude" || env === "gpt" ? (env as Provider) : undefined);

  if (pinned === "claude") {
    return hasClaude
      ? { provider: "claude" }
      : { error: `ANTHROPIC_API_KEY가 설정되지 않았어요. ${KEY_GUIDE}` };
  }
  if (pinned === "gpt") {
    return hasGpt
      ? { provider: "gpt" }
      : { error: `OPENAI_API_KEY가 설정되지 않았어요. ${KEY_GUIDE}` };
  }

  if (hasClaude) return { provider: "claude" };
  if (hasGpt) return { provider: "gpt" };
  return {
    error: `AI API 키가 설정되지 않았어요. ANTHROPIC_API_KEY 또는 OPENAI_API_KEY 중 하나를 ${KEY_GUIDE}`,
  };
}

/** 본문에서 온 임의 값을 Provider로 정규화 — 잘못된 값은 미지정으로 취급. */
export function asRequestedProvider(value: unknown): Provider | undefined {
  return value === "claude" || value === "gpt" ? value : undefined;
}
