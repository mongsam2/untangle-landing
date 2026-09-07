import type { Metadata } from "next";

import { DemoFlow } from "@/components/demo/DemoFlow";

/**
 * 가입 없이 대화와 오늘 할 일을 오가는 데모 라우트다.
 * 상호작용은 가장 안쪽의 DemoFlow 클라이언트 경계에만 둔다.
 */

export const metadata: Metadata = {
  title: "체험 — Untangle",
  description:
    "Untangle과 짧게 대화하며 머릿속 일을 정리하고, 오늘 할 일을 직접 실행해보세요.",
};

export default function DemoPage() {
  return (
    <div className="flex h-dvh justify-center overflow-hidden bg-[var(--backdrop)]">
      <main className="flex h-dvh w-full max-w-[480px] flex-col overflow-hidden bg-sys-bg shadow-[0_0_60px_-20px_rgba(26,26,36,0.15)]">
        <DemoFlow />
      </main>
    </div>
  );
}
