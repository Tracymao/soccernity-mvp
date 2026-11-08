// The message-action interface shared by both conversation surfaces (B-067,
// Decision Log #472 (b)). Figma (file weZWWqggy9j13eX8bhFgs6, node map in
// docs/figma-w8-messaging.md): menus and edit mode A1 to A7, edited label and
// delete B1 to B9, conversation actions C1 to C4, desktop D1 to D10.
//
// Pieces:
//   MessageHost          wraps one bubble: the "..." button (hover and keyboard
//                        on desktop), long-press on touch, and its menu.
//   EditBar              replaces the composer while a message is edited.
//   DeleteMessageDialog  the choice sheet and the two confirmations.
//   ConversationActions  the header "..." menu, Delete chat, Block, the toast.
//
// Menus are fixed-position popovers in a portal, so the chat pop-up's own
// scrolling and clipping cannot hide them. Dialogs are portalled modals with
// Escape, a focus trap and focus restored to where it was.
//
// "Report" (frames A3 and D1) is on THEIR message only, never on your own and
// never on the deleted placeholder (which has no host at all). It opens the
// shared report dialog (pages/community/ReportAction.tsx) for that message;
// the server decides whether the report is allowed and answers one 404 for
// every case it will not explain.
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { createPortal } from "react-dom";
import BlockUserDialog from "../../../components/block/BlockUserDialog";
import type { Message } from "../../../api/messaging";
import ReportAction from "../../community/ReportAction";
import type { ConversationActions as ConversationActionsApi } from "./useConversationActions";
import type { MessageActions } from "./useMessageActions";
import { seenLabel } from "../../community/messages/time";
import { canEditNow, WORDING } from "./messageActionRules";
import "./messageActions.css";

export const MAX_MESSAGE_LENGTH = 3000;
const LONG_PRESS_MS = 500;

// --- icons (line glyphs, currentColor) -----------------------------------

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="msg-icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
const PencilIcon = () => (
  <Icon>
    <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
    <path d="M13.5 6.5l3 3" />
  </Icon>
);
const TrashIcon = () => (
  <Icon>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3" />
  </Icon>
);
const EyeOffIcon = () => (
  <Icon>
    <path d="M3 3l18 18M10.6 6.2A9.6 9.6 0 0 1 12 6c5 0 8.5 4.5 9.5 6a14 14 0 0 1-3 3.4M6.3 7.8A14 14 0 0 0 2.5 12C3.5 13.5 7 18 12 18c1.4 0 2.6-.3 3.7-.8M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </Icon>
);
const CheckIcon = () => (
  <Icon>
    <path d="M4 12.5l5 5L20 6.5" />
  </Icon>
);
const UserIcon = () => (
  <Icon>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" />
  </Icon>
);
const BanIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M5.7 5.7l12.6 12.6" />
  </Icon>
);
const FlagIcon = () => (
  <Icon>
    <path d="M5 21V4" />
    <path d="M5 4h11l-2 4 2 4H5" />
  </Icon>
);
const DotsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="msg-icon">
    <circle cx="5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="19" cy="12" r="1.8" />
  </svg>
);

// --- popover --------------------------------------------------------------

interface PopoverProps {
  anchorRef: RefObject<HTMLElement | null>;
  align: "start" | "end";
  label: string;
  onClose: () => void;
  // Escape returns focus here.
  returnFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

function Popover({ anchorRef, align, label, onClose, returnFocusRef, children }: PopoverProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const menu = ref.current;
    if (!anchor || !menu) return;
    const a = anchor.getBoundingClientRect();
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    let left = align === "end" ? a.right - w : a.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    let top = a.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, a.top - 6 - h);
    setPos({ top, left });
  }, [anchorRef, align]);

  // Focus the first enabled item once the menu is visible.
  useEffect(() => {
    if (!pos) return;
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus({ preventScroll: true });
  }, [pos]);

  useEffect(() => {
    function onDown(e: Event) {
      const target = e.target as Node | null;
      if (target && (ref.current?.contains(target) || anchorRef.current?.contains(target))) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      onClose();
      returnFocusRef?.current?.focus({ preventScroll: true });
    }
    function onAway() {
      onClose();
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onAway, true);
    window.addEventListener("resize", onAway);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onAway, true);
      window.removeEventListener("resize", onAway);
    };
  }, [anchorRef, onClose, returnFocusRef]);

  function onMenuKey(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
    if (items.length === 0) return;
    e.preventDefault();
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "ArrowDown" ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
    items[next].focus({ preventScroll: true });
  }

  return createPortal(
    <div
      ref={ref}
      className="msg-menu"
      role="menu"
      aria-label={label}
      onKeyDown={onMenuKey}
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? "visible" : "hidden" }}
    >
      {children}
    </div>,
    document.body,
  );
}

function MenuItem({
  icon,
  label,
  hint,
  disabled,
  alert,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  disabled?: boolean;
  // Text and icon in semantic/alert (the Block User item, frames BL1 and BL3).
  alert?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={alert ? "msg-menu__item msg-menu__item--alert" : "msg-menu__item"}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      <span className="msg-menu__text">
        <span className="msg-menu__label">{label}</span>
        {hint && <span className="msg-menu__hint">{hint}</span>}
      </span>
    </button>
  );
}

// --- one message's host: "..." button, long-press, menu -------------------

export interface MessageHostProps {
  message: Message;
  mine: boolean;
  actions: MessageActions;
  children: ReactNode;
}

export function MessageHost({ message, mine, actions, children }: MessageHostProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const moreRef = useRef<HTMLButtonElement | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTouchAt = useRef(0);
  const open = actions.menuId === message.id;
  const { openMenu, closeMenu } = actions;

  function clearPress() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }
  useEffect(() => clearPress, []);

  // Long-press on touch (Figma A1). Moving the finger (scrolling) cancels it.
  function onTouchStart(_e: ReactTouchEvent) {
    lastTouchAt.current = Date.now();
    clearPress();
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null;
      openMenu(message.id);
    }, LONG_PRESS_MS);
  }

  const editable = mine && canEditNow(message);

  // A menu item closes the menu, which would drop focus to the page. Put it
  // back on this bubble's "..." button first, so a dialog that opens next
  // gives focus back there when it closes.
  function choose(action: () => void) {
    moreRef.current?.focus({ preventScroll: true });
    action();
  }

  // The report dialog is a SIBLING of the host div, not a child: React events bubble through portals, so a
  // touch inside the dialog would otherwise reach the host's long-press handler and open its menu.
  return (
    <>
    <div
      ref={hostRef}
      className={["msg-host", mine ? "msg-host--mine" : "", open ? "msg-host--open" : ""].filter(Boolean).join(" ")}
      onTouchStart={onTouchStart}
      onTouchMove={clearPress}
      onTouchEnd={clearPress}
      onTouchCancel={clearPress}
      onContextMenu={(e) => {
        // A long-press on a touch screen raises the browser's own menu; keep
        // ours instead. A mouse right-click is left alone.
        if (Date.now() - lastTouchAt.current < 1500) e.preventDefault();
      }}
    >
      {children}
      <button
        ref={moreRef}
        type="button"
        className="msg-more"
        aria-label="Message options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? closeMenu() : openMenu(message.id))}
      >
        <DotsIcon />
      </button>
      {open && (
        <Popover
          anchorRef={hostRef}
          align={mine ? "end" : "start"}
          label="Message actions"
          onClose={closeMenu}
          returnFocusRef={moreRef}
        >
          {mine ? (
            <>
              <MenuItem
                icon={<PencilIcon />}
                label="Edit"
                hint={editable ? "You can edit for 15 minutes" : "Sent more than 15 minutes ago"}
                disabled={!editable}
                onClick={() => choose(() => actions.startEdit(message))}
              />
              <MenuItem icon={<TrashIcon />} label="Delete" onClick={() => choose(() => actions.startDelete(message))} />
            </>
          ) : (
            <>
              <MenuItem icon={<FlagIcon />} label="Report" onClick={() => choose(() => actions.startReport(message))} />
              <MenuItem
                icon={<EyeOffIcon />}
                label="Delete for me"
                hint="Only you will stop seeing it"
                onClick={() => choose(() => actions.startDelete(message))}
              />
            </>
          )}
        </Popover>
      )}
    </div>
    {!mine && actions.reportId === message.id && (
      <ReportAction
        accessToken={actions.accessToken}
        targets={[{ label: "Report message", targetType: "message", targetId: message.id }]}
        startOpen
        onCancel={() => {
          actions.closeReport();
          moreRef.current?.focus({ preventScroll: true });
        }}
        onFinished={() => {
          actions.closeReport();
          moreRef.current?.focus({ preventScroll: true });
        }}
      />
    )}
    </>
  );
}

// "Seen 08:09 AM" under your latest message when it was read (B-061, Figma
// V1 to V4). Only rendered for the message seenLabelMessageId picks; the
// caller passes that message's own `readAt`.
export function SeenLabel({ readAt }: { readAt: string }) {
  return <p className="msg-seen">{seenLabel(readAt)}</p>;
}

// "(Edited)" in the time line of a bubble that was edited (B1).
export function editedSuffix(message: { editedAt?: string | null }): string {
  return message.editedAt ? " · Edited" : "";
}

// --- edit mode ------------------------------------------------------------

export function EditBar({ actions }: { actions: MessageActions }) {
  const edit = actions.edit;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const editId = edit?.id;

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
  }, [editId]);

  if (!edit) return null;
  const saving = edit.status === "saving";
  const blocked = edit.status === "window-closed" || edit.status === "not-editable";
  const trimmed = edit.draft.trim();
  const canSave = !saving && !blocked && trimmed.length > 0 && trimmed !== edit.original;

  return (
    <form
      className="msg-edit"
      aria-label="Edit message"
      onSubmit={(e) => {
        e.preventDefault();
        void actions.saveEdit();
      }}
    >
      <div className="msg-edit__head">
        <span className="msg-edit__title">Editing message</span>
        <button type="button" className="msg-edit__cancel" onClick={actions.cancelEdit} disabled={saving}>
          Cancel
        </button>
      </div>
      {edit.error && (
        <p className="msg-edit__error" role="alert">
          {edit.error}
        </p>
      )}
      <div className="msg-edit__row">
        <input
          ref={inputRef}
          type="text"
          className="msg-edit__input"
          value={edit.draft}
          maxLength={MAX_MESSAGE_LENGTH}
          aria-label="Edit message text"
          disabled={saving}
          onChange={(e) => actions.setEditDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              actions.cancelEdit();
            }
          }}
        />
        <button type="submit" className="msg-btn msg-btn--primary msg-edit__save" disabled={!canSave}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

// --- modal ------------------------------------------------------------------

function Modal({
  titleId,
  variant,
  busy,
  onClose,
  children,
}: {
  titleId: string;
  variant: "sheet" | "dialog";
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = ref.current;
    const target =
      root?.querySelector<HTMLElement>("[data-autofocus]") ??
      root?.querySelector<HTMLElement>("button:not([disabled]), input:not([disabled])");
    target?.focus({ preventScroll: true });
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busyRef.current) {
        e.preventDefault();
        closeRef.current();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.({ preventScroll: true });
    };
  }, []);

  function trapTab(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab") return;
    const focusable = Array.from(
      ref.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), a[href]") ?? [],
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !ref.current?.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !ref.current?.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div
      className="msg-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={ref}
        className={`msg-modal msg-modal--${variant}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={trapTab}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

// --- delete message: choice sheet and confirmations (B2 to B7, D5 to D8) ----

export function DeleteMessageDialog({ actions }: { actions: MessageActions }) {
  const titleId = useId();
  const labelMe = useId();
  const hintMe = useId();
  const labelAll = useId();
  const hintAll = useId();
  const del = actions.del;
  if (!del) return null;

  const who = actions.otherFirstName;
  const theyCapital = who ?? "The other person";
  const deleting = del.status === "deleting";

  if (del.step === "choice") {
    return (
      <Modal key="choice" titleId={titleId} variant="sheet" busy={false} onClose={actions.cancelDelete}>
        <h2 id={titleId} className="msg-modal__title">
          Delete message
        </h2>
        <p className="msg-modal__body">
          {del.mine ? "Choose who this message is deleted for." : "You can delete this message for yourself."}
        </p>
        <button
          type="button"
          className="msg-choice"
          data-autofocus
          aria-labelledby={labelMe}
          aria-describedby={hintMe}
          onClick={() => actions.chooseDelete("me")}
        >
          <span id={labelMe} className="msg-choice__label">
            Delete for me
          </span>
          <span id={hintMe} className="msg-choice__hint">
            Removes it from your chat only. {theyCapital} {del.mine ? "can still see it." : "keeps it."}
          </span>
        </button>
        {del.mine && (
          <button
            type="button"
            className="msg-choice"
            aria-labelledby={labelAll}
            aria-describedby={hintAll}
            onClick={() => actions.chooseDelete("everyone")}
          >
            <span id={labelAll} className="msg-choice__label">
              Delete for everyone
            </span>
            <span id={hintAll} className="msg-choice__hint">
              Replaces it with “{WORDING.deleted}” for both of you.
            </span>
          </button>
        )}
        <button type="button" className="msg-btn msg-btn--secondary" onClick={actions.cancelDelete}>
          Cancel
        </button>
      </Modal>
    );
  }

  const everyone = del.step === "confirm-everyone";
  const title = everyone ? "Delete for everyone?" : "Delete for me?";
  const primary = everyone ? "Delete for everyone" : "Delete for me";
  const failed = del.status === "error";

  return (
    <Modal key={del.step} titleId={titleId} variant="dialog" busy={deleting} onClose={actions.cancelDelete}>
      <h2 id={titleId} className="msg-modal__title">
        {title}
      </h2>
      <p className="msg-modal__body">
        {everyone
          ? `This message will be replaced with “${WORDING.deleted}” for you and ${who ?? "the other person"}. This can’t be undone.`
          : `This message will disappear from your chat. ${theyCapital} will still see it.`}
      </p>
      {everyone && <p className="msg-modal__note">{WORDING.retention}</p>}
      {failed && del.error && (
        <p className="msg-modal__error" role="alert">
          {del.error}
        </p>
      )}
      <button
        type="button"
        className="msg-btn msg-btn--primary"
        disabled={deleting}
        onClick={() => void actions.confirmDelete()}
      >
        {deleting ? "Deleting…" : failed ? "Try again" : primary}
      </button>
      <button type="button" className="msg-btn msg-btn--secondary" disabled={deleting} onClick={actions.cancelDelete}>
        Cancel
      </button>
    </Modal>
  );
}

// --- conversation actions: header menu, Delete chat, Block (C1 to C4, D10) -

export interface ConversationActionsProps {
  actions: ConversationActionsApi;
  accessToken: string;
  otherName: string | null | undefined;
  // Class of the "..." trigger, so each surface can place and size it.
  triggerClassName: string;
  firstName: string | null;
}

export function ConversationActions({
  actions,
  accessToken,
  otherName,
  triggerClassName,
  firstName,
}: ConversationActionsProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const deleteTitle = useId();
  const { toast, dismissToast } = actions;

  // The toast clears itself.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(dismissToast, 4000);
    return () => clearTimeout(t);
  }, [toast, dismissToast]);

  // As for messages: focus returns to the trigger when a dialog closes.
  function choose(action: () => void) {
    triggerRef.current?.focus({ preventScroll: true });
    action();
  }

  const chat = actions.deleteChat;
  const deleting = chat?.status === "deleting";
  const failed = chat?.status === "error";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-label="Conversation options"
        aria-haspopup="menu"
        aria-expanded={actions.menuOpen}
        onClick={actions.toggleMenu}
      >
        <DotsIcon />
      </button>

      {actions.menuOpen && (
        <Popover
          anchorRef={triggerRef}
          align="end"
          label="Conversation actions"
          onClose={actions.closeMenu}
          returnFocusRef={triggerRef}
        >
          <MenuItem icon={<CheckIcon />} label="Mark as Read" onClick={() => choose(() => void actions.markRead())} />
          {actions.otherId && (
            <>
              <MenuItem icon={<UserIcon />} label="View User Profile" onClick={() => choose(actions.viewProfile)} />
              <MenuItem icon={<BanIcon />} label="Block User" alert onClick={() => choose(actions.startBlock)} />
            </>
          )}
          <MenuItem
            icon={<TrashIcon />}
            label="Delete Chat"
            hint="Removes the chat for you only"
            onClick={() => choose(actions.startDeleteChat)}
          />
        </Popover>
      )}

      {actions.blockOpen && actions.otherId && (
        <BlockUserDialog
          accessToken={accessToken}
          userId={actions.otherId}
          name={otherName ?? "this person"}
          onClose={actions.closeBlock}
          onBlocked={actions.onBlocked}
        />
      )}

      {chat && (
        <Modal titleId={deleteTitle} variant="dialog" busy={deleting} onClose={actions.cancelDeleteChat}>
          <h2 id={deleteTitle} className="msg-modal__title">
            Delete this chat?
          </h2>
          <p className="msg-modal__body">
            This removes the conversation for you only. {firstName ?? "The other person"} keeps their copy. If they
            message you again, the chat comes back with only the new messages.
          </p>
          {failed && chat.error && (
            <p className="msg-modal__error" role="alert">
              {chat.error}
            </p>
          )}
          <button
            type="button"
            className="msg-btn msg-btn--primary"
            disabled={deleting}
            onClick={() => void actions.confirmDeleteChat()}
          >
            {deleting ? "Deleting…" : failed ? "Try again" : "Delete chat"}
          </button>
          <button
            type="button"
            className="msg-btn msg-btn--secondary"
            disabled={deleting}
            onClick={actions.cancelDeleteChat}
          >
            Cancel
          </button>
        </Modal>
      )}

      {toast &&
        createPortal(
          <p className="msg-toast" role="status">
            {toast}
          </p>,
          document.body,
        )}
    </>
  );
}

// --- the placeholder (B8, B9, D9) -----------------------------------------

export function DeletedText() {
  return <span className="msg-deleted">{WORDING.deleted}</span>;
}
