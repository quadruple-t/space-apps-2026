import { describe, expect, it } from "vitest";
import { GENERIC_AUTH_ERROR, authErrorCode, authErrorMessage } from "@/lib/auth/errors";

function firebaseError(code: string): Error {
  return Object.assign(new Error(`Firebase: Error (${code}).`), { code });
}

describe("authErrorCode", () => {
  it("reads the code from Firebase-style errors", () => {
    expect(authErrorCode(firebaseError("auth/weak-password"))).toBe("auth/weak-password");
  });

  it("returns null for values without a string code", () => {
    expect(authErrorCode(new Error("boom"))).toBeNull();
    expect(authErrorCode({ code: 42 })).toBeNull();
    expect(authErrorCode(null)).toBeNull();
    expect(authErrorCode("auth/weak-password")).toBeNull();
  });
});

describe("authErrorMessage", () => {
  it.each([
    ["auth/invalid-credential", /don't match/],
    ["auth/wrong-password", /don't match/],
    ["auth/user-not-found", /don't match/],
    ["auth/email-already-in-use", /already uses this email/],
    ["auth/weak-password", /at least 6 characters/],
    ["auth/too-many-requests", /Too many attempts/],
    ["auth/popup-closed-by-user", /closed before it finished/],
    ["auth/popup-blocked", /blocked the Google sign-in window/],
    ["auth/network-request-failed", /Check your connection/],
    ["auth/invalid-email", /valid email/],
    ["auth/missing-password", /Enter your password/],
  ])("maps %s to friendly copy", (code, expected) => {
    expect(authErrorMessage(firebaseError(code))).toMatch(expected);
  });

  it("never leaks raw Firebase messages or codes", () => {
    const message = authErrorMessage(firebaseError("auth/invalid-credential"));
    expect(message).not.toMatch(/Firebase|auth\//);
  });

  it("falls back to generic copy for unknown codes and non-auth errors", () => {
    expect(authErrorMessage(firebaseError("auth/some-new-code"))).toBe(GENERIC_AUTH_ERROR);
    expect(authErrorMessage(new Error("Firebase is not configured"))).toBe(GENERIC_AUTH_ERROR);
    expect(authErrorMessage(undefined)).toBe(GENERIC_AUTH_ERROR);
  });
});
