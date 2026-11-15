/**
 * Short, friendly copy for Firebase Auth failures. Sign-in is optional, so every message keeps
 * the tone light and never implies the rest of the app is blocked.
 */

const MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "That email and password don't match. Check them and try again.",
  "auth/invalid-login-credentials": "That email and password don't match. Check them and try again.",
  "auth/wrong-password": "That email and password don't match. Check them and try again.",
  "auth/user-not-found": "That email and password don't match. Check them and try again.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/missing-email": "Enter your email address.",
  "auth/missing-password": "Enter your password.",
  "auth/email-already-in-use": "An account already uses this email. Sign in instead, or reset your password.",
  "auth/weak-password": "Choose a password with at least 6 characters.",
  "auth/password-does-not-meet-requirements": "That password doesn't meet the requirements. Try a longer one.",
  "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
  "auth/popup-closed-by-user": "Google sign-in was closed before it finished.",
  "auth/cancelled-popup-request": "Google sign-in was closed before it finished.",
  "auth/popup-blocked": "Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.",
  "auth/network-request-failed": "Couldn't reach the sign-in service. Check your connection and try again.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/operation-not-allowed": "This sign-in method isn't available right now.",
  "auth/unauthorized-domain": "Sign-in isn't set up for this web address yet.",
  "auth/account-exists-with-different-credential":
    "This email already uses a different sign-in method. Try Google or email and password instead.",
  "auth/requires-recent-login": "For security, sign in again and retry.",
  "auth/user-token-expired": "Your session expired. Sign in again.",
  "auth/no-current-user": "You're not signed in.",
};

export const GENERIC_AUTH_ERROR = "Something went wrong. Please try again.";

/** The Firebase error code (e.g. "auth/weak-password"), if the value carries one. */
export function authErrorCode(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === "string") return code;
  }
  return null;
}

/** Friendly copy for any thrown value; unknown errors get a generic message. */
export function authErrorMessage(error: unknown): string {
  const code = authErrorCode(error);
  return (code && MESSAGES[code]) || GENERIC_AUTH_ERROR;
}
