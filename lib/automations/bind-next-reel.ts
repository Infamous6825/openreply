import type { InstagramMedia } from "@/lib/meta/client";

/**
 * Binding a "next reel" campaign to the exact post the publisher just made.
 *
 * The attach-next-reel cron guesses: first reel posted after the campaign was
 * created. The publisher knows: it has the permalink Postiz returned. These
 * helpers are pure so the route stays a thin auth + Prisma wrapper.
 */

export function normalizeKeyword(keyword: string): string {
  return keyword.trim().toUpperCase();
}

export function pickPendingAutomation<
  T extends { keywords: string[]; pendingNextReel: boolean; createdAt: Date },
>(automations: T[], keyword: string): T | null {
  const wanted = normalizeKeyword(keyword);
  const matches = automations
    .filter((a) => a.pendingNextReel)
    .filter((a) => a.keywords.some((k) => normalizeKeyword(k) === wanted))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  // Oldest first: if two campaigns somehow share a keyword, the one armed
  // earlier is the one whose reel went out first.
  return matches[0] ?? null;
}

const SHORTCODE = /instagram\.com\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/;

export function reelShortcode(url: string): string {
  const m = SHORTCODE.exec(url ?? "");
  return m ? m[1] : "";
}

export function findMediaByPermalink(
  media: InstagramMedia[],
  postUrl: string
): InstagramMedia | null {
  const code = reelShortcode(postUrl);
  if (!code) return null;
  return media.find((m) => reelShortcode(m.permalink ?? "") === code) ?? null;
}

/**
 * True when the reel's caption names one of the campaign's keywords as a whole
 * word (case-insensitive). The attach-next-reel cron used to bind every pending
 * campaign to the first reel posted after it — on 2026-09-24 that put 37
 * campaigns on one reel. A reel's caption carries its own "Comment X", so the
 * caption is what decides which campaign it gets.
 */
export function captionNamesKeyword(caption: string | null | undefined, keywords: string[]): boolean {
  const text = (caption ?? "").toUpperCase();
  return keywords.some((k) => {
    const kw = normalizeKeyword(k).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return kw.length > 0 && new RegExp(`(^|[^A-Z0-9])${kw}([^A-Z0-9]|$)`).test(text);
  });
}
