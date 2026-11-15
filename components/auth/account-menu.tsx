"use client";

/**
 * Navbar account controls. Signed out: a "Sign in" button that opens the optional sign-in
 * dialog. Signed in: an avatar menu with the account, an optional email-verification nudge,
 * "My expeditions" and Sign out. The slot keeps a fixed size so auth loading never shifts layout.
 */
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { FolderOpen, Loader2, LogIn, LogOut, MailWarning } from "lucide-react";
import type { User } from "firebase/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SheetClose } from "@/components/ui/sheet";
import { authErrorMessage } from "@/lib/auth/errors";
import { useAuth } from "@/lib/auth/useAuth";
import { cn } from "@/lib/utils";
import { useSignInDialog } from "./sign-in-dialog-store";

type ResendState = { status: "idle" | "sending" | "sent" } | { status: "error"; message: string };

function initials(user: User): string {
  const source = user.displayName?.trim() || user.email?.split("@")[0] || "";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : source.slice(0, 2);
  return letters.toUpperCase() || "?";
}

/** Email/password accounts that haven't clicked the link yet; Google accounts arrive verified. */
function needsVerification(user: User): boolean {
  return !user.emailVerified && user.providerData.some((p) => p.providerId === "password");
}

function UserAvatar({ user, className }: { user: User; className?: string }) {
  return (
    <Avatar className={className}>
      {user.photoURL && <AvatarImage src={user.photoURL} alt="" referrerPolicy="no-referrer" />}
      <AvatarFallback className="bg-retro-purple/20 text-xs font-medium text-bone">{initials(user)}</AvatarFallback>
    </Avatar>
  );
}

function useResendVerification() {
  const { resendVerification } = useAuth();
  const [state, setState] = useState<ResendState>({ status: "idle" });
  const resend = async () => {
    setState({ status: "sending" });
    try {
      await resendVerification();
      setState({ status: "sent" });
    } catch (e) {
      setState({ status: "error", message: authErrorMessage(e) });
    }
  };
  return { state, resend };
}

function ResendStatus({ state }: { state: ResendState }) {
  if (state.status === "sent") return <span className="text-retro-blue">Verification email sent.</span>;
  if (state.status === "error") return <span className="text-retro-red">{state.message}</span>;
  return null;
}

/** Desktop navbar slot. */
/** Writes any pending expedition autosave while still signed in, then signs out. */
async function signOutAfterSaving(signOut: () => Promise<void>) {
  await import("@/lib/expeditions/expedition-store")
    .then((m) => m.useExpeditions.getState().flush())
    .catch(() => undefined);
  await signOut();
}

export function AccountMenu({ className }: { className?: string }) {
  const { user, loading, signOut, reloadUser } = useAuth();
  const openSignIn = useSignInDialog((s) => s.open);
  const { state: resendState, resend } = useResendVerification();

  let content: ReactNode;
  if (loading && !user) {
    content = <span aria-hidden className="size-8 rounded-full bg-bone/5" />;
  } else if (!user) {
    content = (
      <Button variant="outline" size="sm" onClick={() => openSignIn()}>
        <LogIn aria-hidden />
        Sign in
      </Button>
    );
  } else {
    const name = user.displayName || user.email || "Your account";
    const unverified = needsVerification(user);
    content = (
      <DropdownMenu
        onOpenChange={(open) => {
          if (open && unverified) void reloadUser();
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-lg" className="rounded-full" aria-label={`Account menu for ${name}`}>
            <UserAvatar user={user} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="w-72 p-1.5">
          <DropdownMenuLabel className="flex items-center gap-3 px-2 py-2 font-normal">
            <UserAvatar user={user} className="size-9" />
            <span className="grid min-w-0">
              <span className="truncate text-sm font-medium text-bone">{user.displayName || "Signed in"}</span>
              {user.email && <span className="truncate text-xs text-muted-foreground">{user.email}</span>}
            </span>
          </DropdownMenuLabel>
          {unverified && (
            <div className="mx-1 mb-1 grid gap-1.5 rounded-md border border-line bg-bone/[0.03] px-2.5 py-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5 text-bone">
                <MailWarning aria-hidden className="size-3.5 text-retro-red" />
                Email not verified
              </span>
              <span>Optional: verifying helps you recover your account.</span>
              <span aria-live="polite">
                <ResendStatus state={resendState} />
              </span>
            </div>
          )}
          {unverified && (
            <DropdownMenuItem
              disabled={resendState.status === "sending" || resendState.status === "sent"}
              onSelect={(e) => {
                e.preventDefault();
                void resend();
              }}
            >
              {resendState.status === "sending" ? <Loader2 aria-hidden className="animate-spin" /> : <MailWarning aria-hidden />}
              Resend verification
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <Link href="/expeditions">
              <FolderOpen aria-hidden />
              My expeditions
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void signOutAfterSaving(signOut)}>
            <LogOut aria-hidden />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return <div className={cn("flex h-10 w-24 items-center justify-end", className)}>{content}</div>;
}

/** Account row for the mobile navigation sheet. */
export function MobileAccountSection({ className }: { className?: string }) {
  const { user, loading, signOut } = useAuth();
  const openSignIn = useSignInDialog((s) => s.open);
  const { state: resendState, resend } = useResendVerification();

  let content: ReactNode;
  if (loading && !user) {
    content = <span aria-hidden className="block h-11" />;
  } else if (!user) {
    content = (
      <div className="grid gap-2">
        <Button variant="outline" size="lg" className="w-full" onClick={() => openSignIn()}>
          <LogIn aria-hidden />
          Sign in
        </Button>
        <p className="text-xs text-muted-foreground">Optional. Signing in only saves expeditions to your account.</p>
      </div>
    );
  } else {
    const unverified = needsVerification(user);
    content = (
      <div className="grid gap-3">
        <div className="flex items-center gap-3">
          <UserAvatar user={user} className="size-10" />
          <span className="grid min-w-0">
            <span className="truncate text-sm font-medium text-bone">{user.displayName || "Signed in"}</span>
            {user.email && <span className="truncate text-xs text-muted-foreground">{user.email}</span>}
          </span>
        </div>
        {unverified && (
          <div className="grid gap-2 rounded-md border border-line px-3 py-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5 text-bone">
              <MailWarning aria-hidden className="size-3.5 text-retro-red" />
              Email not verified (optional)
            </span>
            <span aria-live="polite">
              <ResendStatus state={resendState} />
            </span>
            <Button
              variant="outline"
              size="sm"
              className="justify-self-start"
              disabled={resendState.status === "sending" || resendState.status === "sent"}
              onClick={() => void resend()}
            >
              Resend verification
            </Button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <SheetClose asChild>
            <Button asChild variant="outline" size="lg">
              <Link href="/expeditions">
                <FolderOpen aria-hidden />
                My expeditions
              </Link>
            </Button>
          </SheetClose>
          <Button variant="ghost" size="lg" onClick={() => void signOutAfterSaving(signOut)}>
            <LogOut aria-hidden />
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  return <div className={cn("border-t border-line px-6 py-4", className)}>{content}</div>;
}
