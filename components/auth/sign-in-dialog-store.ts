/**
 * Open the sign-in dialog from anywhere: `useSignInDialog.getState().open()` or
 * `const open = useSignInDialog((s) => s.open)`. Kept free of Firebase imports so callers
 * (e.g. the expedition UI) can use it without pulling the auth SDK into their bundle.
 */
import { create } from "zustand";

export type SignInView = "sign-in" | "create" | "reset";

interface SignInDialogState {
  isOpen: boolean;
  /** Tab or view to show when the dialog opens. */
  view: SignInView;
  /** Increments on every open so the form remounts with fresh fields and no stale errors. */
  session: number;
  open: (view?: SignInView) => void;
  close: () => void;
  setOpen: (open: boolean) => void;
}

export const useSignInDialog = create<SignInDialogState>()((set) => ({
  isOpen: false,
  view: "sign-in",
  session: 0,
  open: (view = "sign-in") => set((s) => ({ isOpen: true, view, session: s.session + 1 })),
  close: () => set({ isOpen: false }),
  setOpen: (isOpen) => set((s) => (isOpen ? { isOpen, session: s.session + 1 } : { isOpen })),
}));
