import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db/client";
import { getWorkspaceInstagramAccount } from "@/lib/instagram-accounts";
import {
  buildAutomationCreateData,
  createAutomationSchema,
} from "@/lib/automations/create-data";

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

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.AUTOMATION_API_KEY;
  if (!expected) return false;

  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!presented) return false;

  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, which is itself a "no".
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Which workspace a keyless caller acts on. An explicit id wins; otherwise the
 * instance must have exactly one workspace, so there is nothing to guess
 * between. Refusing beats silently creating a campaign in the wrong tenant.
 */
async function resolveWorkspaceId(): Promise<
  { ok: true; workspaceId: string } | { ok: false; error: string }
> {
  const configured = process.env.MACHINE_WORKSPACE_ID?.trim();
  if (configured) {
    const workspace = await prisma.workspace.findUnique({
      where: { id: configured },
      select: { id: true },
    });
    if (!workspace) {
      return { ok: false, error: "MACHINE_WORKSPACE_ID names no workspace" };
    }
    return { ok: true, workspaceId: workspace.id };
  }

  const workspaces = await prisma.workspace.findMany({
    select: { id: true },
    take: 2,
  });
  if (workspaces.length === 0) {
    return { ok: false, error: "No workspace exists" };
  }
  if (workspaces.length > 1) {
    return {
      ok: false,
      error: "Multiple workspaces exist — set MACHINE_WORKSPACE_ID",
    };
  }
  return { ok: true, workspaceId: workspaces[0].id };
}

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
