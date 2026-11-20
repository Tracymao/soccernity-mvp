// State for the conversation actions menu (B-067; Figma C1 to C4, D10): Mark
// as read, View user profile, Block user, Delete chat. Shared by both
// conversation surfaces.
import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import { deleteConversation, markConversationRead } from "../../../api/messaging";
import { deleteChatFailure, WORDING } from "./messageActionRules";

export interface UseConversationActionsArgs {
  accessToken: string;
  conversationId: string;
  // The other person's id when it is known; "View user profile" and "Block
  // user" are only offered then.
  otherId: string | null;
  onMarkedRead?: () => void;
  onChatDeleted: () => void;
}

export function useConversationActions({
  accessToken,
  conversationId,
  otherId,
  onMarkedRead,
  onChatDeleted,
}: UseConversationActionsArgs) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [deleteChat, setDeleteChat] = useState<{ status: "idle" | "deleting" | "error"; error: string | null } | null>(
    null,
  );
  const [toast, setToast] = useState<string | null>(null);

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const toggleMenu = useCallback(() => setMenuOpen((o) => !o), []);
  const dismissToast = useCallback(() => setToast(null), []);

  async function markRead() {
    setMenuOpen(false);
    try {
      await markConversationRead(accessToken, conversationId);
      onMarkedRead?.();
      setToast(WORDING.markedRead);
    } catch {
      setToast(WORDING.markReadError);
    }
  }

  function viewProfile() {
    setMenuOpen(false);
    if (otherId) navigate(`/users/${otherId}`);
  }

  function startBlock() {
    setMenuOpen(false);
    setBlockOpen(true);
  }

  function startDeleteChat() {
    setMenuOpen(false);
    setDeleteChat({ status: "idle", error: null });
  }
  function cancelDeleteChat() {
    setDeleteChat((d) => (d && d.status === "deleting" ? d : null));
  }
  async function confirmDeleteChat() {
    if (!deleteChat || deleteChat.status === "deleting") return;
    setDeleteChat({ status: "deleting", error: null });
    try {
      await deleteConversation(accessToken, conversationId);
      setDeleteChat(null);
      onChatDeleted();
    } catch (err) {
      setDeleteChat({ status: "error", error: deleteChatFailure(err) });
    }
  }

  return {
    otherId,
    menuOpen,
    closeMenu,
    toggleMenu,
    markRead,
    viewProfile,
    blockOpen,
    startBlock,
    closeBlock: () => setBlockOpen(false),
    onBlocked: () => {
      setBlockOpen(false);
      setToast(WORDING.blocked);
    },
    deleteChat,
    startDeleteChat,
    cancelDeleteChat,
    confirmDeleteChat,
    toast,
    dismissToast,
  };
}

export type ConversationActions = ReturnType<typeof useConversationActions>;
