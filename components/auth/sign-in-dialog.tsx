"use client";

/**
 * Optional sign-in. Mount <SignInDialog /> once (the navbar does) and open it with
 * useSignInDialog().open(). Closing it, at any step, leaves the visitor in the full app:
 * an account only adds cloud-saved expeditions.
 */
import { useId, useState, type ComponentProps, type FormEvent } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authErrorMessage } from "@/lib/auth/errors";
import { useAuth } from "@/lib/auth/useAuth";
import { useSignInDialog, type SignInView } from "./sign-in-dialog-store";

export { useSignInDialog, type SignInView } from "./sign-in-dialog-store";

type Pending = null | "google" | "email" | "reset";
type FormView = SignInView | "created" | "reset-sent";

export function SignInDialog() {
  const isOpen = useSignInDialog((s) => s.isOpen);
  const setOpen = useSignInDialog((s) => s.setOpen);
  const view = useSignInDialog((s) => s.view);
  const session = useSignInDialog((s) => s.session);

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent className="gap-5 border-line p-6 sm:max-w-md">
        <SignInForm key={session} initialView={view} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function SignInForm({ initialView, onDone }: { initialView: SignInView; onDone: () => void }) {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, sendPasswordReset } = useAuth();
  const [view, setView] = useState<FormView>(initialView);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const ids = useId();
  const errorId = `${ids}-error`;

  const switchView = (next: FormView) => {
    setView(next);
    setError(null);
  };

  async function run(kind: Exclude<Pending, null>, action: () => Promise<unknown>, next?: FormView) {
    setPending(kind);
    setError(null);
    try {
      await action();
      if (next) setView(next);
      else onDone();
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setPending(null);
    }
  }

  const onSignIn = (e: FormEvent) => {
    e.preventDefault();
    void run("email", () => signInWithEmail(email, password));
  };
  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    void run("email", () => signUpWithEmail(email, password, displayName), "created");
  };
  const onReset = (e: FormEvent) => {
    e.preventDefault();
    void run("reset", () => sendPasswordReset(email), "reset-sent");
  };

  const busy = pending !== null;
  const errorText = error ? (
    <p id={errorId} role="alert" className="text-sm text-retro-red">
      {error}
    </p>
  ) : null;
  const describedBy = error ? errorId : undefined;

  const field = (
    id: string,
    label: string,
    props: ComponentProps<typeof Input>,
  ) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`${ids}-${id}`}>{label}</Label>
      <Input id={`${ids}-${id}`} className="h-10" aria-describedby={describedBy} disabled={busy} {...props} />
    </div>
  );

  const emailField = (id: string) =>
    field(id, "Email", {
      type: "email",
      autoComplete: "email",
      required: true,
      value: email,
      onChange: (e) => setEmail(e.target.value),
    });

  const continueWithout = (
    <DialogClose asChild>
      <Button type="button" variant="ghost" size="lg" className="w-full text-muted-foreground">
        Continue without signing in
      </Button>
    </DialogClose>
  );

  if (view === "created" || view === "reset-sent") {
    const created = view === "created";
    return (
      <>
        <DialogHeader>
          <DialogTitle className="type-heading text-lg uppercase tracking-wide">
            {created ? "Account created" : "Check your inbox"}
          </DialogTitle>
          <DialogDescription>
            {created
              ? `You're signed in. We sent a verification link to ${email.trim()}. Verifying is optional; your expeditions save either way.`
              : `If an account exists for ${email.trim()}, a password reset link is on its way.`}
          </DialogDescription>
        </DialogHeader>
        <MailCheck aria-hidden className="size-8 text-retro-blue" />
        {created ? (
          <Button type="button" size="lg" className="w-full" onClick={onDone}>
            Done
          </Button>
        ) : (
          <>
            <Button type="button" size="lg" className="w-full" onClick={() => switchView("sign-in")}>
              Back to sign in
            </Button>
            {continueWithout}
          </>
        )}
      </>
    );
  }

  if (view === "reset") {
    return (
      <>
        <DialogHeader>
          <DialogTitle className="type-heading text-lg uppercase tracking-wide">Reset password</DialogTitle>
          <DialogDescription>Enter your account email and we&apos;ll send you a link to choose a new password.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onReset} className="grid gap-4">
          {emailField("reset-email")}
          {errorText}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {pending === "reset" && <Loader2 aria-hidden className="animate-spin" />}
            Send reset link
          </Button>
        </form>
        <Button type="button" variant="link" className="h-auto justify-self-start p-0" onClick={() => switchView("sign-in")}>
          Back to sign in
        </Button>
        {continueWithout}
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="type-heading text-lg uppercase tracking-wide">Save your expeditions</DialogTitle>
        <DialogDescription>
          Signing in only saves your expeditions to your account so you can open them on any device. Everything else in
          Lunaris360 works without an account.
        </DialogDescription>
      </DialogHeader>

      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        disabled={busy}
        onClick={() => void run("google", signInWithGoogle)}
      >
        {pending === "google" ? <Loader2 aria-hidden className="animate-spin" /> : <GoogleMark />}
        Continue with Google
      </Button>

      <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-muted-foreground" aria-hidden>
        <span className="h-px flex-1 bg-line" />
        or with email
        <span className="h-px flex-1 bg-line" />
      </div>

      <Tabs value={view} onValueChange={(v) => switchView(v as SignInView)}>
        <TabsList className="w-full">
          <TabsTrigger value="sign-in">Sign in</TabsTrigger>
          <TabsTrigger value="create">Create account</TabsTrigger>
        </TabsList>

        <TabsContent value="sign-in" className="pt-2">
          <form onSubmit={onSignIn} className="grid gap-4">
            {emailField("signin-email")}
            {field("signin-password", "Password", {
              type: "password",
              autoComplete: "current-password",
              required: true,
              value: password,
              onChange: (e) => setPassword(e.target.value),
            })}
            {errorText}
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {pending === "email" && <Loader2 aria-hidden className="animate-spin" />}
              Sign in
            </Button>
            <Button
              type="button"
              variant="link"
              className="h-auto justify-self-start p-0 text-muted-foreground hover:text-bone"
              onClick={() => switchView("reset")}
            >
              Forgot password?
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="create" className="pt-2">
          <form onSubmit={onCreate} className="grid gap-4">
            {field("create-name", "Display name", {
              type: "text",
              autoComplete: "name",
              required: true,
              maxLength: 60,
              value: displayName,
              onChange: (e) => setDisplayName(e.target.value),
            })}
            {emailField("create-email")}
            {field("create-password", "Password", {
              type: "password",
              autoComplete: "new-password",
              required: true,
              minLength: 6,
              value: password,
              onChange: (e) => setPassword(e.target.value),
            })}
            {errorText}
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {pending === "email" && <Loader2 aria-hidden className="animate-spin" />}
              Create account
            </Button>
          </form>
        </TabsContent>
      </Tabs>

      {continueWithout}
    </>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="size-4">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
