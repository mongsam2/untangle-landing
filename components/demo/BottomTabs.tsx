"use client";

import { useRef } from "react";
import { Icon } from "@/components/Icon";
import type { DemoTab } from "@/components/demo/types";

/**
 * 대화와 오늘 화면을 URL 변경 없이 전환하는 접근 가능한 하단 탭이다.
 * 화살표 이동과 초점 옮기기가 필요해 클라이언트 컴포넌트로 둔다.
 * 읽지 않은 목록은 점과 보조 기술용 문구로 함께 알린다.
 */

const TABS: {
  id: DemoTab;
  label: string;
  icon: "message-circle" | "list-checks";
}[] = [
  { id: "chat", label: "대화", icon: "message-circle" },
  { id: "today", label: "오늘", icon: "list-checks" },
];

export function BottomTabs({
  activeTab,
  todayUnread,
  onChange,
}: {
  activeTab: DemoTab;
  todayUnread: boolean;
  onChange: (tab: DemoTab) => void;
}) {
  // 화살표 이동 뒤 선택한 탭에 초점을 함께 옮기는 roving tabindex 참조다.
  const tabRefs = useRef<Record<DemoTab, HTMLButtonElement | null>>({
    chat: null,
    today: null,
  });

  const selectAdjacent = (tab: DemoTab) => {
    const next = tab === "chat" ? "today" : "chat";
    onChange(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <nav
      aria-label="데모 화면"
      className="shrink-0 border-t border-sys-line bg-sys-bg pb-[max(env(safe-area-inset-bottom),0.25rem)]"
    >
      <div role="tablist" className="grid grid-cols-2 px-2 pt-1">
        {TABS.map((tab) => {
          const selected = activeTab === tab.id;
          const unread = tab.id === "today" && todayUnread;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[tab.id] = node;
              }}
              id={`demo-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`demo-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.id)}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                  event.preventDefault();
                  selectAdjacent(tab.id);
                }
              }}
              className={`relative flex min-h-14 items-center justify-center gap-2 rounded-[12px] text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sys-primary-dark ${
                selected
                  ? "bg-sys-primary-lighter font-bold text-sys-primary-dark"
                  : "font-medium text-sys-label-neutral hover:bg-sys-bg-gray"
              }`}
            >
              <span className="relative">
                <Icon name={tab.icon} size={19} strokeWidth={2.2} />
                {unread && (
                  <span className="absolute -right-1.5 -top-1 h-2 w-2 rounded-full border-2 border-sys-bg bg-sys-primary-dark" />
                )}
              </span>
              <span>{tab.label}</span>
              {unread && <span className="sr-only">새 할 일 있음</span>}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
