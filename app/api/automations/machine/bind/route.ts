import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getUserMedia } from "@/lib/meta/client";
import { decryptToken } from "@/lib/meta/oauth";
import { isAuthorized, resolveWorkspaceId } from "@/lib/automations/machine-auth";
import {
  findMediaByPermalink,
  pickPendingAutomation,
} from "@/lib/automations/bind-next-reel";

/**
 * Bind a pending "next reel" campaign to a specific post.
 *
 * The publisher calls this the moment Postiz reports the reel live, with the
 * permalink. Until then the campaign sits at pendingNextReel and would be
 * bound by the daily cron to whichever reel appeared first — wrong when reels
 * go out of order, late when one is posted after 06:00 UTC. Same bearer key
 * as /api/automations/machine: this changes which post a DM campaign fires on.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  keyword: z.string().trim().min(1).max(100),
  // Anything else can't be resolved by getUserMedia/findMediaByPermalink below,
  // which only ever look at the connected Instagram account's own media.
  postUrl: z.string().url().regex(/^https:\/\/(www\.)?instagram\.com\//, "postUrl must be an instagram.com URL"),
  postId: z.string().trim().min(1).optional(),
});

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const ws = await resolveWorkspaceId();
  if (!ws.ok) {
    return NextResponse.json({ success: false, error: ws.error }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { keyword, postUrl } = parsed.data;

  const pending = await prisma.automation.findMany({
    where: { workspaceId: ws.workspaceId, isActive: true, pendingNextReel: true },
    include: { instagramAccount: true },
  });
  const automation = pickPendingAutomation(pending, keyword);
  if (!automation) {
    return NextResponse.json({
      success: true,
      bound: false,
      reason: `no pending campaign for keyword ${keyword.toUpperCase()}`,
    });
  }

  // Resolve the media id when the caller only has the permalink; the
  // comment webhook matches on media id, not URL.
  let postId = parsed.data.postId ?? null;
  if (!postId && automation.instagramAccount?.accessToken) {
    try {
      const token = decryptToken(automation.instagramAccount.accessToken);
      const media = await getUserMedia(token, 25);
      postId = findMediaByPermalink(media, postUrl)?.id ?? null;
    } catch (err) {
      console.error("[machine/bind] media lookup failed", automation.id, err);
    }
  }

  await prisma.automation.update({
    where: { id: automation.id },
    data: { postUrl, postId, pendingNextReel: false },
  });

  return NextResponse.json({
    success: true,
    bound: true,
    automationId: automation.id,
    postId,
    // A null postId means the permalink was not in the last 25 media; the
    // cron will not touch it now, so surface it for the dashboard.
    warning: postId ? undefined : "post id not resolved from permalink",
  });
}
