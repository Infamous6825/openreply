import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getWorkspaceInstagramAccount } from "@/lib/instagram-accounts";
import {
  buildAutomationCreateData,
  createAutomationSchema,
} from "@/lib/automations/create-data";
import { isAuthorized, resolveWorkspaceId } from "@/lib/automations/machine-auth";

/**
 * Create a campaign without a browser session.
 *
 * The dashboard's own POST /api/automations authenticates with a NextAuth
 * database session, which a scheduled script has no way to hold. This route
 * takes the same input and produces the same record, authenticated instead by
 * a bearer key.
 *
 * The key is deliberately NOT CRON_SECRET. That one guards endpoints that only
 * reconcile existing state; this one creates campaigns that send DMs to real
 * people, so leaking one must not grant the other.
 */

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const workspaceResult = await resolveWorkspaceId();
  if (!workspaceResult.ok) {
    return NextResponse.json(
      { success: false, error: workspaceResult.error },
      { status: 400 }
    );
  }
  const { workspaceId } = workspaceResult;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  const parsed = createAutomationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid input",
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const instagramAccount = await getWorkspaceInstagramAccount(
    workspaceId,
    parsed.data.instagramAccountId
  );
  if (!instagramAccount) {
    return NextResponse.json(
      { success: false, error: "Connect Instagram before creating campaigns" },
      { status: 400 }
    );
  }

  // The caller is a scheduled pipeline that retries, so creation has to be
  // idempotent here rather than in the caller: two active campaigns sharing a
  // keyword make a comment match ambiguous, and a lost race in the caller's
  // own check would produce exactly that.
  const keywords = parsed.data.matchAnyWord ? [] : parsed.data.keywords;
  if (keywords.length > 0) {
    const existing = await prisma.automation.findFirst({
      where: {
        workspaceId,
        instagramAccountId: instagramAccount.id,
        isActive: true,
        keywords: { hasSome: keywords },
      },
      include: { trackedLinks: true },
    });
    if (existing) {
      return NextResponse.json(
        {
          success: true,
          data: existing,
          created: false,
          reason: "an active campaign already uses one of these keywords",
        },
        { status: 200 }
      );
    }
  }

  const automation = await prisma.automation.create({
    data: buildAutomationCreateData(parsed.data, {
      workspaceId,
      instagramAccountId: instagramAccount.id,
    }),
    include: { trackedLinks: true },
  });

  return NextResponse.json(
    { success: true, data: automation, created: true },
    { status: 201 }
  );
}
