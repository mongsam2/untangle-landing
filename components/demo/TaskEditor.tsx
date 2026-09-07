"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Icon } from "@/components/Icon";
import { CHAT_LIMITS } from "@/lib/chat/contract";

/**
 * 큰 할 일과 서브태스크의 추가·수정을 같은 모달 양식으로 처리한다.
 * dialog.showModal 과 포커스 순환이 DOM 요소를 요구해 클라이언트 컴포넌트로 둔다.
 * 삭제는 한 번 더 확인하고, 모달 안에서 키보드 포커스를 순환한다.
 */

export interface TaskEditorValues {
  title: string;
  description: string;
}

export function TaskEditor({
  kind,
  mode,
  initialTitle = "",
  initialDescription = "",
  onSave,
  onDelete,
  onClose,
}: {
  kind: "task" | "subtask";
  mode: "add" | "edit";
  initialTitle?: string;
  initialDescription?: string;
  onSave: (values: TaskEditorValues) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // 브라우저 모달과 첫 입력·확인 버튼의 포커스를 명시적으로 관리한다.
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const deleteCancelRef = useRef<HTMLButtonElement>(null);

  // showModal 은 DOM에 붙은 노드에서만 열 수 있고, 닫지 않고 사라지면
  // top layer와 포커스가 남으므로 마운트와 언마운트 시점에 처리한다.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    queueMicrotask(() => titleRef.current?.focus());
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  const noun = kind === "task" ? "할 일" : "서브태스크";
  const heading = `${noun} ${mode === "add" ? "추가" : "수정"}`;

  const leaveDeleteConfirmation = () => {
    setConfirmDelete(false);
    queueMicrotask(() => deleteButtonRef.current?.focus());
  };

  const handleTab = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== "Tab") return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href]",
      ),
    ).filter((element) => element.offsetParent !== null);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="task-editor-heading"
      aria-modal="true"
      onKeyDown={handleTab}
      onCancel={(event) => {
        event.preventDefault();
        if (confirmDelete) leaveDeleteConfirmation();
        else onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto max-h-[calc(100dvh-1rem)] w-[calc(100%-2rem)] max-w-[440px] overflow-y-auto overscroll-contain rounded-[20px] bg-sys-bg p-0 text-sys-label-strong shadow-[0_20px_70px_-20px_rgba(26,26,36,0.45)] backdrop:bg-sys-dark-bg/35"
    >
      {confirmDelete ? (
        <div className="p-5 sm:p-6">
          <h2
            id="task-editor-heading"
            className="text-[19px] font-bold tracking-[-0.02em]"
          >
            {kind === "task" ? "할 일을" : "서브태스크를"} 삭제할까요?
          </h2>
          <p
            id="task-editor-delete-result"
            className="pt-3 text-[14px] leading-[1.6] text-sys-label-neutral"
          >
            {kind === "task"
              ? `“${initialTitle}”의 설명과 서브태스크도 함께 사라져요.`
              : `“${initialTitle}” 항목이 목록에서 사라져요.`}
          </p>
          <div className="flex gap-2 pt-6">
            <button
              ref={deleteCancelRef}
              type="button"
              aria-describedby="task-editor-heading task-editor-delete-result"
              onClick={leaveDeleteConfirmation}
              className="min-h-11 flex-1 rounded-[11px] bg-sys-primary-dark px-4 text-[14px] font-bold text-sys-on-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sys-primary-dark"
            >
              취소
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="min-h-11 flex-1 rounded-[11px] border border-sys-pri-high bg-sys-pri-high-bg px-4 text-[14px] font-bold text-sys-pri-high focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sys-pri-high"
            >
              삭제
            </button>
          </div>
        </div>
      ) : (
        <form
          // 브라우저 기본 말풍선이 한국어 오류 안내를 가로채지 않도록 제약 검증만 끈다.
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const normalizedTitle = title.trim();
            const normalizedDescription = description.trim();
            if (!normalizedTitle) {
              setError("제목을 입력해 주세요.");
              titleRef.current?.focus();
              return;
            }
            if (kind === "task" && !normalizedDescription) {
              setError("설명을 입력해 주세요.");
              descriptionRef.current?.focus();
              return;
            }
            onSave({
              title: normalizedTitle,
              description: kind === "task" ? normalizedDescription : "",
            });
          }}
          className="p-5 sm:p-6"
        >
          <div className="flex items-center justify-between gap-3">
            <h2
              id="task-editor-heading"
              className="text-[19px] font-bold tracking-[-0.02em]"
            >
              {heading}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={`${heading} 닫기`}
              className="flex h-11 w-11 items-center justify-center rounded-full text-sys-label-neutral hover:bg-sys-bg-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sys-primary-dark"
            >
              <Icon name="x" size={19} />
            </button>
          </div>

          <label
            className="block pt-5 text-[13px] font-bold"
            htmlFor="task-editor-title"
          >
            제목
          </label>
          <input
            ref={titleRef}
            id="task-editor-title"
            value={title}
            required
            aria-invalid={error === "제목을 입력해 주세요."}
            aria-describedby={
              error === "제목을 입력해 주세요."
                ? "task-editor-error"
                : undefined
            }
            onChange={(event) => {
              setTitle(limitText(event.target.value, CHAT_LIMITS.taskTitle));
              setError(null);
            }}
            className="mt-2 min-h-11 w-full rounded-[11px] border border-sys-line-strong bg-sys-bg px-3 text-[16px] outline-none focus:border-sys-primary-dark focus:ring-2 focus:ring-sys-primary-lighter"
          />
          <p className="pt-1 text-right text-[11px] text-sys-label-neutral">
            {Array.from(title.trim()).length} / {CHAT_LIMITS.taskTitle}자
          </p>

          {kind === "task" && (
            <>
              <label
                className="block pt-3 text-[13px] font-bold"
                htmlFor="task-editor-description"
              >
                설명
              </label>
              <textarea
                ref={descriptionRef}
                id="task-editor-description"
                value={description}
                required
                rows={4}
                aria-invalid={error === "설명을 입력해 주세요."}
                aria-describedby={
                  error === "설명을 입력해 주세요."
                    ? "task-editor-error"
                    : undefined
                }
                onChange={(event) => {
                  setDescription(
                    limitText(event.target.value, CHAT_LIMITS.taskDescription),
                  );
                  setError(null);
                }}
                className="mt-2 w-full resize-none rounded-[11px] border border-sys-line-strong bg-sys-bg px-3 py-2.5 text-[16px] leading-[1.5] outline-none focus:border-sys-primary-dark focus:ring-2 focus:ring-sys-primary-lighter"
              />
              <p className="pt-1 text-right text-[11px] text-sys-label-neutral">
                {Array.from(description.trim()).length} /{" "}
                {CHAT_LIMITS.taskDescription}자
              </p>
            </>
          )}

          {error && (
            <p
              id="task-editor-error"
              role="alert"
              className="pt-2 text-[13px] text-sys-pri-high"
            >
              {error}
            </p>
          )}

          <div className="flex items-center gap-2 pt-5">
            {mode === "edit" && onDelete && (
              <button
                ref={deleteButtonRef}
                type="button"
                onClick={() => {
                  setConfirmDelete(true);
                  queueMicrotask(() => deleteCancelRef.current?.focus());
                }}
                className="min-h-11 rounded-[11px] px-3 text-[14px] font-bold text-sys-pri-high hover:bg-sys-pri-high-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sys-pri-high"
              >
                삭제
              </button>
            )}
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 rounded-[11px] border border-sys-line-strong px-4 text-[14px] font-semibold text-sys-label-neutral focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sys-primary-dark"
              >
                취소
              </button>
              <button
                type="submit"
                className="min-h-11 rounded-[11px] bg-sys-primary-dark px-5 text-[14px] font-bold text-sys-on-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sys-primary-dark"
              >
                저장
              </button>
            </div>
          </div>
        </form>
      )}
    </dialog>
  );
}

function limitText(value: string, limit: number): string {
  // 계약은 공백을 제거한 뒤 길이를 재므로 앞 공백은 상한에 넣지 않는다.
  const characters = Array.from(value);
  const leading = characters.length - Array.from(value.trimStart()).length;
  return characters.slice(0, leading + limit).join("");
}
