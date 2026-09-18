import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db/client";

export function isAuthorized(request: NextRequest): boolean {
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
export async function resolveWorkspaceId(): Promise<
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
