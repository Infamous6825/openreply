/**
 * Machine auth boundary — Unit Tests
 *
 * `isAuthorized` is the only thing standing between the public internet and
 * every /api/automations/machine* route (bind, create). It must fail closed:
 * no key configured, wrong key, wrong-length key, or a missing bearer prefix
 * are all "no", never a thrown error or an accidental match.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { isAuthorized } from "../lib/automations/machine-auth";

function requestWith(header?: string): NextRequest {
  const init = header ? { headers: { authorization: header } } : undefined;
  return new NextRequest("http://localhost/api/automations/machine", init);
}

const KEY = "correct-key-length18"; // fixed length, reused so the "wrong key" cases can match it exactly

describe("isAuthorized", () => {
  beforeEach(() => {
    vi.stubEnv("AUTOMATION_API_KEY", "");
  });

  it("returns false when AUTOMATION_API_KEY is unset", () => {
    const request = requestWith("Bearer anything");
    expect(isAuthorized(request)).toBe(false);
  });

  it("returns false for a wrong-length key (the timingSafeEqual guard)", () => {
    vi.stubEnv("AUTOMATION_API_KEY", KEY);
    const request = requestWith("Bearer short");
    expect(isAuthorized(request)).toBe(false);
  });

  it("returns false for a same-length wrong key", () => {
    vi.stubEnv("AUTOMATION_API_KEY", KEY);
    const wrongSameLength = "x".repeat(KEY.length);
    const request = requestWith(`Bearer ${wrongSameLength}`);
    expect(isAuthorized(request)).toBe(false);
  });

  it("returns false when the header has no Bearer prefix", () => {
    vi.stubEnv("AUTOMATION_API_KEY", KEY);
    const request = requestWith(KEY);
    expect(isAuthorized(request)).toBe(false);
  });

  it("returns true for the correct key", () => {
    vi.stubEnv("AUTOMATION_API_KEY", KEY);
    const request = requestWith(`Bearer ${KEY}`);
    expect(isAuthorized(request)).toBe(true);
  });
});
