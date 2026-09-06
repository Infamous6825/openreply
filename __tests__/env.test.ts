import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  getEncryptionKeyHex,
  getMetaGraphApiVersion,
  isEmailAllowedToSignIn,
  requireEnv,
} from "../lib/env";

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe("environment helpers", () => {
  it("requires missing variables", () => {
    expect(() => requireEnv("MISSING_TEST_ENV")).toThrow(
      "MISSING_TEST_ENV environment variable is required"
    );
  });

  it("validates the encryption key format", () => {
    vi.stubEnv("ENCRYPTION_KEY", "not-hex");
    expect(() => getEncryptionKeyHex()).toThrow(
      "ENCRYPTION_KEY must be a 32-byte hex string"
    );
  });

  it("defaults Meta Graph API version in one place", () => {
    expect(getMetaGraphApiVersion()).toBe("v25.0");
    vi.stubEnv("META_GRAPH_API_VERSION", "v26.0");
    expect(getMetaGraphApiVersion()).toBe("v26.0");
  });
});

describe("sign-in allowlist", () => {
  it("allows everyone when ALLOWED_EMAILS is unset", () => {
    expect(isEmailAllowedToSignIn("anyone@example.com")).toBe(true);
  });

  it("allows everyone when ALLOWED_EMAILS is empty or only separators", () => {
    vi.stubEnv("ALLOWED_EMAILS", "  , ,  ");
    expect(isEmailAllowedToSignIn("anyone@example.com")).toBe(true);
  });

  it("only allows listed addresses once ALLOWED_EMAILS is set", () => {
    vi.stubEnv("ALLOWED_EMAILS", "owner@example.com,team@example.com");
    expect(isEmailAllowedToSignIn("owner@example.com")).toBe(true);
    expect(isEmailAllowedToSignIn("team@example.com")).toBe(true);
    expect(isEmailAllowedToSignIn("stranger@example.com")).toBe(false);
  });

  it("ignores case and surrounding whitespace on both sides", () => {
    vi.stubEnv("ALLOWED_EMAILS", "  Owner@Example.com , team@example.com ");
    expect(isEmailAllowedToSignIn("OWNER@example.COM")).toBe(true);
  });

  it("rejects a missing address when the list is set", () => {
    vi.stubEnv("ALLOWED_EMAILS", "owner@example.com");
    expect(isEmailAllowedToSignIn(null)).toBe(false);
    expect(isEmailAllowedToSignIn(undefined)).toBe(false);
    expect(isEmailAllowedToSignIn("")).toBe(false);
  });

  // GHSA-7rqj-j65f-68wh: Auth.js normalizes an address after validating it, so
  // a homoglyph separator can make the checked address differ from the one the
  // magic link reaches. These must never be treated as the allowlisted address.
  it("rejects homoglyph separators that NFKC-fold onto an allowed address", () => {
    vi.stubEnv("ALLOWED_EMAILS", "owner@example.com");
    // U+FF20 FULLWIDTH COMMERCIAL AT folds to "@" under NFKC.
    expect(isEmailAllowedToSignIn("owner＠example.com")).toBe(false);
    // U+FF45 FULLWIDTH LATIN SMALL LETTER E folds to "e".
    expect(isEmailAllowedToSignIn("ownｅr@example.com")).toBe(false);
  });

  it("rejects non-ASCII addresses outright when an allowlist is set", () => {
    vi.stubEnv("ALLOWED_EMAILS", "owner@example.com");
    expect(isEmailAllowedToSignIn("ownér@example.com")).toBe(false);
    expect(isEmailAllowedToSignIn("owner@exámple.com")).toBe(false);
  });

  it("rejects addresses carrying more than one separator", () => {
    vi.stubEnv("ALLOWED_EMAILS", "owner@example.com");
    expect(isEmailAllowedToSignIn("owner@example.com@evil.test")).toBe(false);
    expect(isEmailAllowedToSignIn("owner@@example.com")).toBe(false);
  });

  it("still accepts the plain allowlisted address", () => {
    vi.stubEnv("ALLOWED_EMAILS", "owner@example.com");
    expect(isEmailAllowedToSignIn("owner@example.com")).toBe(true);
  });
});
