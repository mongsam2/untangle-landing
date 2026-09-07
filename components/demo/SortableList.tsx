"use client";

import { DragDropProvider, PointerSensor } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import {
  Accessibility,
  defaultPreset,
  PointerActivationConstraints,
} from "@dnd-kit/dom";
import type { DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/dom";
import type { ReactNode } from "react";

/**
 * 큰 할 일과 서브태스크에 같은 포인터·터치·키보드 재정렬 기반을 제공한다.
 * dnd-kit 센서가 DOM 포인터·키보드 이벤트에 직접 붙으므로 클라이언트에서만 동작한다.
 * 그룹 밖 이동은 막고 reducer가 이해하는 출발·도착 ID만 전달한다.
 */

// Accessibility 는 static configure 를 따로 선언하지 않아 옵션이 Record<string, any>로
// 느슨해진다. 오타가 조용히 영어 기본 안내로 넘어가지 않도록 생성자 타입으로 좁힌다.
type AccessibilityOptions = NonNullable<
  ConstructorParameters<typeof Accessibility>[1]
>;

const POINTER_SENSOR = PointerSensor.configure({
  activationConstraints(event) {
    return event.pointerType === "touch"
      ? [new PointerActivationConstraints.Delay({ value: 220, tolerance: 8 })]
      : [new PointerActivationConstraints.Distance({ value: 6 })];
  },
});

const KOREAN_ACCESSIBILITY = Accessibility.configure({
  screenReaderInstructions: {
    draggable:
      "순서를 바꾸려면 스페이스바를 누르세요. 위아래 화살표로 이동하고, 스페이스바로 놓거나 Esc 키로 취소하세요.",
  },
  announcements: {
    dragstart(event: DragStartEvent) {
      const source = event.operation.source;
      if (!source) return;
      return `${getSortableLabel(source)} 항목을 들었습니다.`;
    },
    dragover(event: DragOverEvent) {
      const source = event.operation.source;
      if (!source || !isSortable(source)) return;
      return `${getSortableLabel(source)}, ${source.index + 1}번째 위치입니다.`;
    },
    dragend(event: DragEndEvent) {
      const { source } = event.operation;
      if (!source) return;
      const label = getSortableLabel(source);
      if (event.canceled) return `${label} 항목의 순서 변경을 취소했습니다.`;
      if (!isSortable(source)) return `${label} 항목을 놓았습니다.`;
      return `${label} 항목을 ${source.index + 1}번째 위치에 놓았습니다.`;
    },
  },
} satisfies AccessibilityOptions);

// DragDropProvider 는 plugins·sensors 를 Object.is 로만 비교해, 렌더마다 새 배열을 받으면
// 플러그인을 매번 파괴하고 다시 만든다. 그 사이 접근성 안내와 키보드 센서가 사라지므로
// 기본 목록에서 교체한 배열을 모듈 수준에 한 번만 만들어 둔다.
const PLUGINS = defaultPreset.plugins.map((plugin) =>
  plugin === Accessibility ? KOREAN_ACCESSIBILITY : plugin,
);
const SENSORS = defaultPreset.sensors.map((sensor) =>
  sensor === PointerSensor ? POINTER_SENSOR : sensor,
);

export interface SortableItemControls {
  handleRef: (element: HTMLButtonElement | null) => void;
  isDragging: boolean;
}

export function SortableProvider({
  groups,
  disabled,
  onReorder,
  children,
}: {
  groups: Record<string, string[]>;
  disabled: boolean;
  onReorder: (groupId: string, itemId: string, overItemId: string) => void;
  children: ReactNode;
}) {
  return (
    <DragDropProvider
      plugins={PLUGINS}
      sensors={SENSORS}
      onDragOver={(event) => {
        const source = event.operation.source;
        if (
          isSortable(source) &&
          source.initialGroup !== undefined &&
          source.group !== source.initialGroup
        ) {
          event.preventDefault();
        }
      }}
      onDragEnd={(event) => {
        if (disabled || event.canceled) return;
        const source = event.operation.source;
        if (
          !isSortable(source) ||
          source.initialGroup === undefined ||
          source.group !== source.initialGroup ||
          source.initialIndex === source.index
        ) {
          return;
        }
        const groupId = String(source.initialGroup);
        const itemIds = groups[groupId];
        const itemId = itemIds?.[source.initialIndex];
        const overItemId = itemIds?.[source.index];
        if (itemId && overItemId) onReorder(groupId, itemId, overItemId);
      }}
    >
      {children}
    </DragDropProvider>
  );
}

export function SortableList<T extends { id: string; title: string }>({
  items,
  groupId,
  disabled,
  renderItem,
}: {
  items: T[];
  groupId: string;
  disabled: boolean;
  renderItem: (
    item: T,
    index: number,
    controls: SortableItemControls,
  ) => ReactNode;
}) {
  return (
    <div role="list" className="space-y-2.5">
      {items.map((item, index) => (
        <SortableItem
          key={item.id}
          item={item}
          index={index}
          groupId={groupId}
          disabled={disabled}
          renderItem={renderItem}
        />
      ))}
    </div>
  );
}

function SortableItem<T extends { id: string; title: string }>({
  item,
  index,
  groupId,
  disabled,
  renderItem,
}: {
  item: T;
  index: number;
  groupId: string;
  disabled: boolean;
  renderItem: (
    item: T,
    index: number,
    controls: SortableItemControls,
  ) => ReactNode;
}) {
  const { ref, handleRef, isDragging } = useSortable({
    id: item.id,
    data: { label: item.title },
    index,
    group: groupId,
    type: groupId,
    accept: groupId,
    disabled,
  });

  return (
    <div
      ref={ref}
      role="listitem"
      className={isDragging ? "relative z-20 opacity-80" : undefined}
    >
      {renderItem(item, index, { handleRef, isDragging })}
    </div>
  );
}

function getSortableLabel(source: { data: Record<string, unknown> }): string {
  return typeof source.data.label === "string"
    ? source.data.label
    : "선택한 항목";
}
