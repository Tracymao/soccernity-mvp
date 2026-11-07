// State for the per-message actions (B-067): the menu, edit mode, and the
// delete flow. Used by both conversation surfaces, which each own their
// message list and pass its setter in. Every change that succeeds updates
// that list in place, so nothing reloads.
import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import {
  deleteMessage,
  editMessage,
  isDeletedMessage,
  type DeleteMessageScope,
  type Message,
  type ThreadMessage,
} from "../../../api/messaging";
import { deleteFailure, editFailure, firstNameOf, type EditFailureStatus } from "./messageActionRules";

export interface EditState {
  id: string;
  original: string;
  draft: string;
  status: "idle" | "saving" | EditFailureStatus;
  error: string | null;
}

export type DeleteStep = "choice" | "confirm-me" | "confirm-everyone";

export interface DeleteState {
  id: string;
  mine: boolean;
  step: DeleteStep;
  status: "idle" | "deleting" | "error";
  error: string | null;
}

export interface UseMessageActionsArgs {
  accessToken: string;
  conversationId: string;
  currentUserId: string;
  otherName: string | null | undefined;
  setMessages: Dispatch<SetStateAction<ThreadMessage[]>>;
}

export function useMessageActions({
  accessToken,
  conversationId,
  currentUserId,
  otherName,
  setMessages,
}: UseMessageActionsArgs) {
  const [menuId, setMenuId] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [del, setDel] = useState<DeleteState | null>(null);
  // Bumped after a change that succeeded, so a surface can refresh anything
  // derived from the list (the Community sidebar's preview) without doing so
  // on every load.
  const [changeTick, setChangeTick] = useState(0);

  const openMenu = useCallback((id: string) => setMenuId(id), []);
  const closeMenu = useCallback(() => setMenuId(null), []);

  const startEdit = useCallback((message: Message) => {
    setMenuId(null);
    setEdit({ id: message.id, original: message.contentText, draft: message.contentText, status: "idle", error: null });
  }, []);
  const setEditDraft = useCallback((draft: string) => {
    setEdit((e) => (e ? { ...e, draft } : e));
  }, []);
  const cancelEdit = useCallback(() => {
    setEdit((e) => (e && e.status === "saving" ? e : null));
  }, []);

  async function saveEdit() {
    if (!edit || edit.status === "saving" || edit.status === "window-closed" || edit.status === "not-editable") return;
    const text = edit.draft.trim();
    if (!text || text === edit.original) return;
    const id = edit.id;
    setEdit({ ...edit, status: "saving", error: null });
    try {
      const result = await editMessage(accessToken, conversationId, id, text);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id && !isDeletedMessage(m)
            ? { ...m, contentText: result.contentText, editedAt: result.editedAt ?? new Date().toISOString() }
            : m,
        ),
      );
      setEdit(null);
      setChangeTick((t) => t + 1);
    } catch (err) {
      const failure = editFailure(err);
      setEdit((e) => (e && e.id === id ? { ...e, status: failure.status, error: failure.text } : e));
    }
  }

  const startDelete = useCallback(
    (message: Message) => {
      setMenuId(null);
      setDel({
        id: message.id,
        mine: message.senderId === currentUserId,
        step: "choice",
        status: "idle",
        error: null,
      });
    },
    [currentUserId],
  );
  const chooseDelete = useCallback((scope: DeleteMessageScope) => {
    setDel((d) =>
      d ? { ...d, step: scope === "me" ? "confirm-me" : "confirm-everyone", status: "idle", error: null } : d,
    );
  }, []);
  const cancelDelete = useCallback(() => {
    setDel((d) => (d && d.status === "deleting" ? d : null));
  }, []);

  async function confirmDelete() {
    if (!del || del.status === "deleting" || del.step === "choice") return;
    const { id } = del;
    const scope: DeleteMessageScope = del.step === "confirm-me" ? "me" : "everyone";
    setDel({ ...del, status: "deleting", error: null });
    try {
      await deleteMessage(accessToken, conversationId, id, scope);
      setMessages((prev) =>
        scope === "me"
          ? prev.filter((m) => m.id !== id)
          : prev.map((m) =>
              m.id === id
                ? {
                    id: m.id,
                    conversationId: m.conversationId,
                    senderId: m.senderId,
                    sentAt: m.sentAt,
                    editedAt: null,
                    deletedForEveryone: true,
                    contentText: null,
                  }
                : m,
            ),
      );
      setEdit((e) => (e && e.id === id ? null : e));
      setDel(null);
      setChangeTick((t) => t + 1);
    } catch (err) {
      setDel((d) => (d && d.id === id ? { ...d, status: "error", error: deleteFailure(err) } : d));
    }
  }

  return {
    menuId,
    openMenu,
    closeMenu,
    edit,
    startEdit,
    setEditDraft,
    cancelEdit,
    saveEdit,
    del,
    startDelete,
    chooseDelete,
    cancelDelete,
    confirmDelete,
    changeTick,
    otherFirstName: firstNameOf(otherName),
  };
}

export type MessageActions = ReturnType<typeof useMessageActions>;
