"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Dispatch, MouseEvent } from "react";
import { isTaskCompleted } from "@/components/demo/state";
import {
  SortableList,
  SortableProvider,
  type SortableItemControls,
} from "@/components/demo/SortableList";
import {
  TaskEditor,
  type TaskEditorValues,
} from "@/components/demo/TaskEditor";
import type { DemoAction, DemoRuntimeState } from "@/components/demo/types";
import { Icon } from "@/components/Icon";
import { CHAT_LIMITS } from "@/lib/chat/contract";
import type { Subtask, Task } from "@/lib/chat/types";

/**
 * 오늘 목록의 완료, 직접 편집과 같은 그룹 안 재정렬을 제공한다.
 * 편집 모달 상태와 이동 뒤 포커스 복귀가 필요해 클라이언트 컴포넌트로 둔다.
 * AI 요청 중에는 내용 변경만 잠그고 완료 체크와 탭 이동은 유지한다.
 */

const DATE_FORMAT = new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
  weekday: "long",
});
const OPEN_TASK_GROUP = "task:open";
const DONE_TASK_GROUP = "task:done";
const SUBTASK_GROUP_PREFIX = "subtask:";
const REPEAT_MARKER = "\u00a0";

type EditorState =
  | {
      kind: "task";
      mode: "add";
      returnFocus: HTMLElement;
    }
  | {
      kind: "task";
      mode: "edit";
      taskId: string;
      returnFocus: HTMLElement;
    }
  | {
      kind: "subtask";
      mode: "add";
      taskId: string;
      returnFocus: HTMLElement;
    }
  | {
      kind: "subtask";
      mode: "edit";
      taskId: string;
      subtaskId: string;
      returnFocus: HTMLElement;
    };

export function TodayView({
  state,
  dispatch,
  onOpenChat,
}: {
  state: DemoRuntimeState;
  dispatch: Dispatch<DemoAction>;
  onOpenChat: () => void;
}) {
  const [editor, setEditor] = useState<EditorState | null>(null);
  // 메뉴 이동은 드래그와 달리 dnd-kit 라이브 리전을 거치지 않으므로 직접 알린다.
  const [moveNotice, setMoveNotice] = useState("");
  // 삭제로 원래 트리거가 사라질 때 포커스를 돌려보낼 안전한 대상을 보관한다.
  const addTaskRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const editingLocked = state.request.status === "pending";
  const incomplete = state.tasks.filter(
    (task) => !isTaskCompleted(task, state.completedIds),
  );
  const complete = state.tasks.filter((task) =>
    isTaskCompleted(task, state.completedIds),
  );
  const groups: Record<string, string[]> = {
    [OPEN_TASK_GROUP]: incomplete.map((task) => task.id),
    [DONE_TASK_GROUP]: complete.map((task) => task.id),
  };
  for (const task of state.tasks) {
    groups[`${SUBTASK_GROUP_PREFIX}${task.id}`] = task.subtasks.map(
      (subtask) => subtask.id,
    );
  }

  const closeEditor = () => {
    const returnFocus = editor?.returnFocus;
    const parentTaskId = editor && "taskId" in editor ? editor.taskId : null;
    setEditor(null);
    queueMicrotask(() => {
      if (focusIfPossible(returnFocus)) return;
      const parentCheckbox = parentTaskId
        ? panelRef.current?.querySelector<HTMLInputElement>(
            `[data-completion-id="${parentTaskId}"]`,
          )
        : null;
      if (focusIfPossible(parentCheckbox)) return;
      if (focusIfPossible(addTaskRef.current)) return;
      panelRef.current?.focus();
    });
  };

  const finishEditor = (action: DemoAction) => {
    dispatch(action);
    closeEditor();
  };

  // 같은 문구가 연달아 나오면 라이브 리전이 다시 읽지 않으므로 보이지 않는 공백을 번갈아 붙인다.
  const announceMove = (message: string) => {
    setMoveNotice((current) =>
      current.endsWith(REPEAT_MARKER) ? message : `${message}${REPEAT_MARKER}`,
    );
  };

  const toggleCompletion = (completionId: string, action: DemoAction) => {
    dispatch(action);
    queueMicrotask(() => {
      panelRef.current
        ?.querySelector<HTMLInputElement>(
          `[data-completion-id="${completionId}"]`,
        )
        ?.focus();
    });
  };

  const editingTask =
    editor && "taskId" in editor
      ? state.tasks.find((task) => task.id === editor.taskId)
      : undefined;
  const editingSubtask =
    editor?.kind === "subtask" && editor.mode === "edit"
      ? editingTask?.subtasks.find((subtask) => subtask.id === editor.subtaskId)
      : undefined;

  return (
    <section
      ref={panelRef}
      id="demo-panel-today"
      role="tabpanel"
      tabIndex={-1}
      aria-labelledby="demo-tab-today"
      className="h-full overflow-y-auto overscroll-contain px-4 pb-8 pt-5 focus:outline-none"
    >
      <p role="status" aria-live="polite" className="sr-only">
        {moveNotice}
      </p>

      <div className="flex items-end justify-between gap-3">
        <div>
          <p
            suppressHydrationWarning
            className="text-[13px] font-medium text-sys-label-neutral"
          >
            {DATE_FORMAT.format(new Date())}
          </p>
          <h1 className="pt-1 text-[24px] font-bold tracking-[-0.025em] text-sys-label-strong">
            오늘의 할 일
          </h1>
        </div>
        <button
          ref={addTaskRef}
          type="button"
          disabled={editingLocked || state.tasks.length >= CHAT_LIMITS.tasks}
          aria-describedby="today-editing-status"
          onClick={(event) =>
            setEditor({
              kind: "task",
              mode: "add",
              returnFocus: event.currentTarget,
            })
          }
          className="flex min-h-11 shrink-0 items-center gap-1 rounded-[10px] bg-sys-primary-dark px-3 text-[13px] font-bold text-sys-on-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sys-primary-dark disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Icon name="plus" size={16} strokeWidth={2.4} />할 일 추가
        </button>
      </div>

      <p
        id="today-editing-status"
        className="min-h-5 pt-2 text-[12px] leading-[1.45] text-sys-label-neutral"
      >
        {editingLocked
          ? "AI 답변을 기다리는 동안에는 내용 편집과 순서 변경을 잠시 멈춰요."
          : state.tasks.length >= CHAT_LIMITS.tasks
            ? `할 일은 최대 ${CHAT_LIMITS.tasks}개예요. 항목을 지운 뒤 추가해 주세요.`
            : "완료 체크는 대화와 별도로 이 브라우저에 저장돼요."}
      </p>

      {state.tasks.length === 0 ? (
        <EmptyToday onOpenChat={onOpenChat} />
      ) : (
        <SortableProvider
          groups={groups}
          disabled={editingLocked}
          onReorder={(groupId, itemId, overItemId) => {
            if (groupId === OPEN_TASK_GROUP || groupId === DONE_TASK_GROUP) {
              dispatch({
                type: "reorderTask",
                taskId: itemId,
                overTaskId: overItemId,
              });
              return;
            }
            if (groupId.startsWith(SUBTASK_GROUP_PREFIX)) {
              dispatch({
                type: "reorderSubtask",
                taskId: groupId.slice(SUBTASK_GROUP_PREFIX.length),
                subtaskId: itemId,
                overSubtaskId: overItemId,
              });
            }
          }}
        >
          <div className="space-y-7 pt-5">
            <TaskGroup
              id="today-open-tasks"
              label="할 일"
              groupId={OPEN_TASK_GROUP}
              tasks={incomplete}
              completedIds={state.completedIds}
              editingLocked={editingLocked}
              dispatch={dispatch}
              onToggleCompletion={toggleCompletion}
              onAnnounceMove={announceMove}
              onEditTask={(taskId, returnFocus) =>
                setEditor({
                  kind: "task",
                  mode: "edit",
                  taskId,
                  returnFocus,
                })
              }
              onAddSubtask={(taskId, returnFocus) =>
                setEditor({
                  kind: "subtask",
                  mode: "add",
                  taskId,
                  returnFocus,
                })
              }
              onEditSubtask={(taskId, subtaskId, returnFocus) =>
                setEditor({
                  kind: "subtask",
                  mode: "edit",
                  taskId,
                  subtaskId,
                  returnFocus,
                })
              }
            />
            <TaskGroup
              id="today-done-tasks"
              label="완료"
              groupId={DONE_TASK_GROUP}
              tasks={complete}
              completedIds={state.completedIds}
              editingLocked={editingLocked}
              dispatch={dispatch}
              onToggleCompletion={toggleCompletion}
              onAnnounceMove={announceMove}
              onEditTask={(taskId, returnFocus) =>
                setEditor({
                  kind: "task",
                  mode: "edit",
                  taskId,
                  returnFocus,
                })
              }
              onAddSubtask={(taskId, returnFocus) =>
                setEditor({
                  kind: "subtask",
                  mode: "add",
                  taskId,
                  returnFocus,
                })
              }
              onEditSubtask={(taskId, subtaskId, returnFocus) =>
                setEditor({
                  kind: "subtask",
                  mode: "edit",
                  taskId,
                  subtaskId,
                  returnFocus,
                })
              }
            />
          </div>
        </SortableProvider>
      )}

      <div className="pt-8 text-center">
        <Link
          href="/register?from=demo"
          className="rounded-[8px] px-2 py-1 text-[13px] font-medium text-sys-label-neutral underline decoration-sys-line-strong underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sys-primary-dark"
        >
          체험 소감 남기기
        </Link>
      </div>

      {editor?.kind === "task" && (editor.mode === "add" || editingTask) && (
        <TaskEditor
          key={editor.mode === "add" ? "add-task" : editor.taskId}
          kind="task"
          mode={editor.mode}
          initialTitle={editingTask?.title}
          initialDescription={editingTask?.description}
          onSave={(values) => {
            if (editor.mode === "add") {
              finishEditor({
                type: "addTask",
                id: crypto.randomUUID(),
                title: values.title,
                description: values.description,
              });
            } else {
              finishEditor({
                type: "updateTask",
                taskId: editor.taskId,
                title: values.title,
                description: values.description,
              });
            }
          }}
          onDelete={
            editor.mode === "edit"
              ? () =>
                  finishEditor({
                    type: "deleteTask",
                    taskId: editor.taskId,
                  })
              : undefined
          }
          onClose={closeEditor}
        />
      )}

      {editor?.kind === "subtask" &&
        editingTask &&
        (editor.mode === "add" || editingSubtask) && (
          <TaskEditor
            key={
              editor.mode === "add"
                ? `add-subtask-${editor.taskId}`
                : editor.subtaskId
            }
            kind="subtask"
            mode={editor.mode}
            initialTitle={editingSubtask?.title}
            onSave={(values: TaskEditorValues) => {
              if (editor.mode === "add") {
                finishEditor({
                  type: "addSubtask",
                  taskId: editor.taskId,
                  id: crypto.randomUUID(),
                  title: values.title,
                });
              } else {
                finishEditor({
                  type: "updateSubtask",
                  taskId: editor.taskId,
                  subtaskId: editor.subtaskId,
                  title: values.title,
                });
              }
            }}
            onDelete={
              editor.mode === "edit"
                ? () =>
                    finishEditor({
                      type: "deleteSubtask",
                      taskId: editor.taskId,
                      subtaskId: editor.subtaskId,
                    })
                : undefined
            }
            onClose={closeEditor}
          />
        )}
    </section>
  );
}

function focusIfPossible(element: HTMLElement | null | undefined): boolean {
  if (!element?.isConnected || element.matches(":disabled")) return false;
  element.focus();
  return document.activeElement === element;
}

function EmptyToday({ onOpenChat }: { onOpenChat: () => void }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sys-primary-lighter text-sys-primary-dark">
        <Icon name="list-checks" size={23} />
      </div>
      <p className="pt-4 text-[16px] font-bold text-sys-label-strong">
        아직 정리된 할 일이 없어요
      </p>
      <p className="max-w-[280px] pt-2 text-[13.5px] leading-[1.6] text-sys-label-neutral">
        대화에서 머릿속 이야기를 꺼내면 지금 할 수 있는 크기로 함께 정리해요.
      </p>
      <button
        type="button"
        onClick={onOpenChat}
        className="mt-5 rounded-[11px] bg-sys-primary-dark px-5 py-3 text-[14px] font-bold text-sys-on-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sys-primary-dark"
      >
        대화에서 정리하기
      </button>
    </div>
  );
}

function TaskGroup({
  id,
  label,
  groupId,
  tasks,
  completedIds,
  editingLocked,
  dispatch,
  onToggleCompletion,
  onAnnounceMove,
  onEditTask,
  onAddSubtask,
  onEditSubtask,
}: {
  id: string;
  label: string;
  groupId: string;
  tasks: Task[];
  completedIds: string[];
  editingLocked: boolean;
  dispatch: Dispatch<DemoAction>;
  onToggleCompletion: (completionId: string, action: DemoAction) => void;
  onAnnounceMove: (message: string) => void;
  onEditTask: (taskId: string, returnFocus: HTMLElement) => void;
  onAddSubtask: (taskId: string, returnFocus: HTMLElement) => void;
  onEditSubtask: (
    taskId: string,
    subtaskId: string,
    returnFocus: HTMLElement,
  ) => void;
}) {
  if (tasks.length === 0) return null;
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="pb-2 text-[12px] font-bold text-sys-label-neutral">
        {label} {tasks.length}
      </h2>
      <SortableList
        items={tasks}
        groupId={groupId}
        disabled={editingLocked}
        renderItem={(task, index, sortable) => (
          <TaskCard
            task={task}
            index={index}
            groupTasks={tasks}
            completedIds={completedIds}
            editingLocked={editingLocked}
            sortable={sortable}
            dispatch={dispatch}
            onToggleCompletion={onToggleCompletion}
            onAnnounceMove={onAnnounceMove}
            onEditTask={onEditTask}
            onAddSubtask={onAddSubtask}
            onEditSubtask={onEditSubtask}
          />
        )}
      />
    </section>
  );
}

function TaskCard({
  task,
  index,
  groupTasks,
  completedIds,
  editingLocked,
  sortable,
  dispatch,
  onToggleCompletion,
  onAnnounceMove,
  onEditTask,
  onAddSubtask,
  onEditSubtask,
}: {
  task: Task;
  index: number;
  groupTasks: Task[];
  completedIds: string[];
  editingLocked: boolean;
  sortable: SortableItemControls;
  dispatch: Dispatch<DemoAction>;
  onToggleCompletion: (completionId: string, action: DemoAction) => void;
  onAnnounceMove: (message: string) => void;
  onEditTask: (taskId: string, returnFocus: HTMLElement) => void;
  onAddSubtask: (taskId: string, returnFocus: HTMLElement) => void;
  onEditSubtask: (
    taskId: string,
    subtaskId: string,
    returnFocus: HTMLElement,
  ) => void;
}) {
  const completed = isTaskCompleted(task, completedIds);
  const completedSet = new Set(completedIds.map((id) => id.toLowerCase()));
  const completedSubtasks = task.subtasks.filter((subtask) =>
    completedSet.has(subtask.id.toLowerCase()),
  ).length;

  return (
    <article
      className={`rounded-[16px] border bg-sys-bg p-3.5 motion-safe:transition-shadow ${
        sortable.isDragging
          ? "border-sys-primary-light shadow-[0_12px_35px_-15px_rgba(106,69,231,0.45)]"
          : "border-sys-line-strong"
      }`}
    >
      <div className="flex items-start gap-2">
        <DragHandle
          handleRef={sortable.handleRef}
          disabled={editingLocked}
          label={`${task.title} 순서 바꾸기`}
        />
        <CompletionCheckbox
          checked={completed}
          mixed={!completed && completedSubtasks > 0}
          completionId={task.id}
          onChange={() =>
            onToggleCompletion(task.id, {
              type: "toggleTaskCompletion",
              taskId: task.id,
            })
          }
          label={`${task.title} 완료`}
        />
        <div className="min-w-0 flex-1">
          <h3
            className={`break-words text-[15px] font-bold leading-[1.45] ${
              completed
                ? "text-sys-label-neutral line-through"
                : "text-sys-label-strong"
            }`}
          >
            {task.title}
          </h3>
          <p className="break-words pt-1 text-[13px] leading-[1.55] text-sys-label-neutral">
            {task.description}
          </p>
          {task.subtasks.length > 0 && (
            <p className="pt-2 text-[11px] font-semibold text-sys-label-neutral">
              {completedSubtasks}/{task.subtasks.length} 완료
            </p>
          )}
        </div>
        <ActionMenu
          label={`${task.title} 작업`}
          disabled={editingLocked}
          canMoveUp={index > 0}
          canMoveDown={index < groupTasks.length - 1}
          onEdit={(returnFocus) => onEditTask(task.id, returnFocus)}
          onMoveUp={() => {
            const over = groupTasks[index - 1];
            if (over) {
              dispatch({
                type: "reorderTask",
                taskId: task.id,
                overTaskId: over.id,
              });
              onAnnounceMove(
                `${task.title} 항목을 ${index}번째 위치에 놓았습니다.`,
              );
            }
          }}
          onMoveDown={() => {
            const over = groupTasks[index + 1];
            if (over) {
              dispatch({
                type: "reorderTask",
                taskId: task.id,
                overTaskId: over.id,
              });
              onAnnounceMove(
                `${task.title} 항목을 ${index + 2}번째 위치에 놓았습니다.`,
              );
            }
          }}
        />
      </div>

      {task.subtasks.length > 0 && (
        <div className="mt-3 border-t border-sys-line pt-3">
          <SortableList
            items={task.subtasks}
            groupId={`${SUBTASK_GROUP_PREFIX}${task.id}`}
            disabled={editingLocked}
            renderItem={(subtask, subtaskIndex, subtaskSortable) => (
              <SubtaskRow
                task={task}
                subtask={subtask}
                index={subtaskIndex}
                completed={completedSet.has(subtask.id.toLowerCase())}
                editingLocked={editingLocked}
                sortable={subtaskSortable}
                dispatch={dispatch}
                onToggleCompletion={onToggleCompletion}
                onAnnounceMove={onAnnounceMove}
                onEditSubtask={onEditSubtask}
              />
            )}
          />
        </div>
      )}

      <button
        type="button"
        disabled={editingLocked || task.subtasks.length >= CHAT_LIMITS.subtasks}
        onClick={(event) => onAddSubtask(task.id, event.currentTarget)}
        className="mt-3 min-h-11 rounded-[9px] px-2 text-[12px] font-bold text-sys-primary-dark hover:bg-sys-primary-lighter focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sys-primary-dark disabled:cursor-not-allowed disabled:text-sys-label-neutral disabled:hover:bg-transparent"
      >
        + 서브태스크 추가
      </button>
      {task.subtasks.length >= CHAT_LIMITS.subtasks && (
        <span className="pl-1 text-[11px] text-sys-label-neutral">
          {`서브태스크는 최대 ${CHAT_LIMITS.subtasks}개예요. 항목을 지운 뒤 추가해 주세요.`}
        </span>
      )}
    </article>
  );
}

function SubtaskRow({
  task,
  subtask,
  index,
  completed,
  editingLocked,
  sortable,
  dispatch,
  onToggleCompletion,
  onAnnounceMove,
  onEditSubtask,
}: {
  task: Task;
  subtask: Subtask;
  index: number;
  completed: boolean;
  editingLocked: boolean;
  sortable: SortableItemControls;
  dispatch: Dispatch<DemoAction>;
  onToggleCompletion: (completionId: string, action: DemoAction) => void;
  onAnnounceMove: (message: string) => void;
  onEditSubtask: (
    taskId: string,
    subtaskId: string,
    returnFocus: HTMLElement,
  ) => void;
}) {
  return (
    <div
      className={`flex min-h-10 items-start gap-2 rounded-[10px] px-1 py-1.5 ${
        sortable.isDragging ? "bg-sys-primary-lighter" : "bg-sys-bg-gray"
      }`}
    >
      <DragHandle
        handleRef={sortable.handleRef}
        disabled={editingLocked}
        label={`${subtask.title} 순서 바꾸기`}
        compact
      />
      <CompletionCheckbox
        checked={completed}
        completionId={subtask.id}
        onChange={() =>
          onToggleCompletion(subtask.id, {
            type: "toggleSubtaskCompletion",
            taskId: task.id,
            subtaskId: subtask.id,
          })
        }
        label={`${subtask.title} 완료`}
        compact
      />
      <span
        className={`min-w-0 flex-1 break-words pt-0.5 text-[13px] leading-[1.45] ${
          completed
            ? "text-sys-label-neutral line-through"
            : "text-sys-label-normal"
        }`}
      >
        {subtask.title}
      </span>
      <ActionMenu
        label={`${subtask.title} 작업`}
        disabled={editingLocked}
        canMoveUp={index > 0}
        canMoveDown={index < task.subtasks.length - 1}
        onEdit={(returnFocus) =>
          onEditSubtask(task.id, subtask.id, returnFocus)
        }
        onMoveUp={() => {
          const over = task.subtasks[index - 1];
          if (over) {
            dispatch({
              type: "reorderSubtask",
              taskId: task.id,
              subtaskId: subtask.id,
              overSubtaskId: over.id,
            });
            onAnnounceMove(
              `${subtask.title} 항목을 ${index}번째 위치에 놓았습니다.`,
            );
          }
        }}
        onMoveDown={() => {
          const over = task.subtasks[index + 1];
          if (over) {
            dispatch({
              type: "reorderSubtask",
              taskId: task.id,
              subtaskId: subtask.id,
              overSubtaskId: over.id,
            });
            onAnnounceMove(
              `${subtask.title} 항목을 ${index + 2}번째 위치에 놓았습니다.`,
            );
          }
        }}
      />
    </div>
  );
}

// dnd-kit 은 손잡이에 aria-roledescription 이 없을 때만 영어 기본값을 넣으므로 미리 지정한다.
function DragHandle({
  handleRef,
  disabled,
  label,
  compact = false,
}: {
  handleRef: (element: HTMLButtonElement | null) => void;
  disabled: boolean;
  label: string;
  compact?: boolean;
}) {
  return (
    <button
      ref={handleRef}
      type="button"
      disabled={disabled}
      aria-label={label}
      aria-roledescription="순서 변경 손잡이"
      className={`flex shrink-0 touch-none items-center justify-center rounded-[8px] text-sys-label-neutral hover:bg-sys-bg-gray focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sys-primary-dark disabled:cursor-not-allowed disabled:opacity-40 ${
        compact ? "h-11 w-10" : "h-11 w-11"
      }`}
    >
      <Icon name="grip-vertical" size={16} />
    </button>
  );
}

function ActionMenu({
  label,
  disabled,
  canMoveUp,
  canMoveDown,
  onEdit,
  onMoveUp,
  onMoveDown,
}: {
  label: string;
  disabled: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onEdit: (returnFocus: HTMLElement) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // 메뉴 밖의 포인터 입력은 렌더 중에 알 수 없어, 열려 있는 동안만 문서에서 직접 듣는다.
  // 다른 카드의 메뉴를 눌러도 이 리스너가 먼저 닫으므로 여러 메뉴가 동시에 열리지 않는다.
  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && containerRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
  }, [open]);

  const closeMenu = (event: MouseEvent<HTMLButtonElement>): HTMLElement => {
    setOpen(false);
    return triggerRef.current ?? event.currentTarget;
  };

  return (
    <div
      ref={containerRef}
      className="relative shrink-0"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-expanded={open && !disabled}
        aria-label={`${label} 더보기`}
        onClick={() => setOpen((current) => !current)}
        className="flex h-11 w-11 items-center justify-center rounded-[8px] text-sys-label-neutral hover:bg-sys-bg-gray focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sys-primary-dark disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Icon name="more-vertical" size={17} />
      </button>
      {open && !disabled && (
        <div className="absolute right-0 top-9 z-30 min-w-32 rounded-[11px] border border-sys-line-strong bg-sys-bg p-1.5 shadow-[0_12px_32px_-12px_rgba(26,26,36,0.35)]">
          <MenuButton
            onClick={(event) => onEdit(closeMenu(event))}
            label="수정"
          />
          <MenuButton
            disabled={!canMoveUp}
            onClick={(event) => {
              const returnFocus = closeMenu(event);
              onMoveUp();
              queueMicrotask(() => returnFocus.focus());
            }}
            label="위로 이동"
          />
          <MenuButton
            disabled={!canMoveDown}
            onClick={(event) => {
              const returnFocus = closeMenu(event);
              onMoveDown();
              queueMicrotask(() => returnFocus.focus());
            }}
            label="아래로 이동"
          />
        </div>
      )}
    </div>
  );
}

function MenuButton({
  label,
  disabled = false,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="block min-h-11 w-full rounded-[8px] px-3 text-left text-[12px] font-semibold text-sys-label-normal hover:bg-sys-bg-gray focus-visible:outline-2 focus-visible:outline-sys-primary-dark disabled:cursor-not-allowed disabled:text-sys-label-alt disabled:hover:bg-transparent"
    >
      {label}
    </button>
  );
}

function CompletionCheckbox({
  checked,
  mixed = false,
  completionId,
  onChange,
  label,
  compact = false,
}: {
  checked: boolean;
  mixed?: boolean;
  completionId: string;
  onChange: () => void;
  label: string;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  // indeterminate 는 JSX 속성이 없어 커밋된 input 노드에 직접 설정해야 한다.
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = mixed;
  }, [mixed]);

  return (
    <label
      className={`flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-[8px] focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-sys-primary-dark ${
        compact ? "-my-1 -ml-1" : "-my-1.5 -ml-1.5"
      }`}
    >
      <input
        ref={inputRef}
        type="checkbox"
        checked={checked}
        data-completion-id={completionId}
        onChange={onChange}
        aria-label={label}
        className={`${compact ? "h-[18px] w-[18px]" : "h-5 w-5"} accent-sys-primary-dark`}
      />
    </label>
  );
}
