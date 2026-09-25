import { describe, it, expect } from "vitest";
import {
  normalizeKeyword,
  pickPendingAutomation,
  findMediaByPermalink,
  reelShortcode,
} from "../lib/automations/bind-next-reel";

const d = (s: string) => new Date(s);

describe("normalizeKeyword", () => {
  it("uppercases and trims", () => {
    expect(normalizeKeyword("  realtime ")).toBe("REALTIME");
  });
});

describe("pickPendingAutomation", () => {
  const rows = [
    { id: "a", keywords: ["REALTIME"], pendingNextReel: false, createdAt: d("2026-09-01") },
    { id: "b", keywords: ["realtime"], pendingNextReel: true, createdAt: d("2026-09-10") },
    { id: "c", keywords: ["REALTIME", "LINK"], pendingNextReel: true, createdAt: d("2026-09-05") },
    { id: "d", keywords: ["OTHER"], pendingNextReel: true, createdAt: d("2026-09-02") },
  ];

  it("returns the oldest pending campaign that lists the keyword, case-insensitively", () => {
    expect(pickPendingAutomation(rows, "Realtime")?.id).toBe("c");
  });

  it("ignores campaigns already bound", () => {
    expect(pickPendingAutomation([rows[0]], "REALTIME")).toBeNull();
  });

  it("returns null when nothing matches", () => {
    expect(pickPendingAutomation(rows, "NOPE")).toBeNull();
  });
});

describe("reelShortcode / findMediaByPermalink", () => {
  it("extracts the shortcode from reel and p URLs", () => {
    expect(reelShortcode("https://www.instagram.com/reel/DcouoOls6cK/?utm_source=x")).toBe("DcouoOls6cK");
    expect(reelShortcode("https://www.instagram.com/p/DcouoOls6cK")).toBe("DcouoOls6cK");
    expect(reelShortcode("https://example.com/")).toBe("");
  });

  it("matches media by shortcode regardless of trailing slash or query", () => {
    const media = [
      { id: "1", media_type: "VIDEO", timestamp: "t", permalink: "https://www.instagram.com/reel/AAA/" },
      { id: "2", media_type: "VIDEO", timestamp: "t", permalink: "https://www.instagram.com/reel/DcouoOls6cK/" },
    ];
    expect(findMediaByPermalink(media, "https://www.instagram.com/reel/DcouoOls6cK?igsh=1")?.id).toBe("2");
    expect(findMediaByPermalink(media, "https://www.instagram.com/reel/ZZZ/")).toBeNull();
  });
});

import { captionNamesKeyword } from "@/lib/automations/bind-next-reel";

describe("captionNamesKeyword", () => {
  it("matches the keyword as a whole word, any case", () => {
    expect(captionNamesKeyword("Comment 'harness' for the repo", ["HARNESS"])).toBe(true);
    expect(captionNamesKeyword('Comment "ROUTER" and I\'ll send it', ["router"])).toBe(true);
  });
  it("rejects captions that do not name the keyword", () => {
    expect(captionNamesKeyword("Comment 'harness' for the repo", ["ROUTER"])).toBe(false);
    expect(captionNamesKeyword("#DesignSystems", ["DESIGN"])).toBe(false);
    expect(captionNamesKeyword(null, ["ADS"])).toBe(false);
    expect(captionNamesKeyword("anything", [])).toBe(false);
  });
});
