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
