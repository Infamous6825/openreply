import { describe, expect, it } from "vitest";

import {
  buildAutomationCreateData,
  createAutomationSchema,
} from "../lib/automations/create-data";

const OWNER = { workspaceId: "workspace_1", instagramAccountId: "account_1" };

/** Run input through the schema so defaults are applied, as the routes do. */
function build(input: Record<string, unknown>) {
  const parsed = createAutomationSchema.parse(input);
  return buildAutomationCreateData(parsed, OWNER);
}

const minimal = {
  name: "Magnet",
  dmMessage: "Here it is",
  keywords: ["blender"],
  postId: "post_1",
};

describe("createAutomationSchema", () => {
  it("accepts a next-reel campaign that has no post yet", () => {
    const parsed = createAutomationSchema.safeParse({
      name: "Magnet",
      dmMessage: "Here it is",
      keywords: ["blender"],
      pendingNextReel: true,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a campaign that targets no post at all", () => {
    const parsed = createAutomationSchema.safeParse({
      name: "Magnet",
      dmMessage: "Here it is",
      keywords: ["blender"],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a campaign with neither keywords nor matchAnyWord", () => {
    const parsed = createAutomationSchema.safeParse({
      name: "Magnet",
      dmMessage: "Here it is",
      postId: "post_1",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an opening DM with no button label", () => {
    const parsed = createAutomationSchema.safeParse({
      ...minimal,
      openingDmEnabled: true,
      openingDmMessage: "Tap below",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("buildAutomationCreateData", () => {
  it("clears the post for a next-reel campaign so the cron can bind it", () => {
    const data = build({
      ...minimal,
      postId: "post_1",
      postUrl: "https://example.com/reel",
      pendingNextReel: true,
    });
    expect(data.pendingNextReel).toBe(true);
    expect(data.postId).toBeNull();
    expect(data.postUrl).toBeNull();
  });

  it("keeps the post for a specific-post campaign", () => {
    const data = build({ ...minimal, postUrl: "https://example.com/reel" });
    expect(data.postId).toBe("post_1");
    expect(data.postUrl).toBe("https://example.com/reel");
    expect(data.pendingNextReel).toBe(false);
  });

  it("clears the post for a match-any-post campaign", () => {
    const data = build({ ...minimal, matchAnyPost: true });
    expect(data.postId).toBeNull();
  });

  it("drops keywords when matching any word", () => {
    const data = build({ ...minimal, matchAnyWord: true });
    expect(data.keywords).toEqual([]);
    expect(data.matchAnyWord).toBe(true);
  });

  it("keeps keywords otherwise", () => {
    const data = build({ ...minimal, keywords: ["blender", "3d"] });
    expect(data.keywords).toEqual(["blender", "3d"]);
  });

  it("creates a tracked link for the primary destination", () => {
    const data = build({
      ...minimal,
      trackedDestinationUrl: "https://notion.so/magnet",
    });
    expect(data.trackedLinks?.create).toHaveLength(1);
    expect(data.trackedLinks?.create?.[0]).toMatchObject({
      workspaceId: "workspace_1",
      label: "Primary campaign link",
      destinationUrl: "https://notion.so/magnet",
    });
  });

  it("labels a secondary link with its button text", () => {
    const data = build({
      ...minimal,
      trackedDestinationUrl: "https://notion.so/magnet",
      secondaryDestinationUrl: "https://example.com/more",
      secondaryButtonLabel: "  See more  ",
    });
    expect(data.trackedLinks?.create).toHaveLength(2);
    expect(data.trackedLinks?.create?.[1].label).toBe("See more");
  });

  it("creates no tracked link when the destination is an empty string", () => {
    const data = build({ ...minimal, trackedDestinationUrl: "" });
    expect(data.trackedLinks).toBeUndefined();
  });

  it("gives every campaign its own report share slug", () => {
    const a = build(minimal);
    const b = build(minimal);
    expect(a.reportShareSlug).toBeTruthy();
    expect(a.reportShareSlug).not.toBe(b.reportShareSlug);
  });

  it("zeroes the follow-up delay when the follow-up is off", () => {
    const data = build({
      ...minimal,
      followUpEnabled: false,
      followUpMessage: "Still interested?",
      followUpDelayMinutes: 90,
    });
    expect(data.followUpDelayMinutes).toBe(0);
    expect(data.followUpMessage).toBeNull();
  });

  it("keeps the follow-up delay when the follow-up is on", () => {
    const data = build({
      ...minimal,
      followUpEnabled: true,
      followUpMessage: "Still interested?",
      followUpDelayMinutes: 90,
    });
    expect(data.followUpDelayMinutes).toBe(90);
    expect(data.followUpMessage).toBe("Still interested?");
  });

  it("trims and drops blank public replies", () => {
    const data = build({
      ...minimal,
      publicReplyEnabled: true,
      publicReplyMessages: ["  Sent! ", "   ", "Check your DMs"],
    });
    expect(data.publicReplyMessages).toEqual(["Sent!", "Check your DMs"]);
    expect(data.publicReplyMessage).toBe("Sent!");
  });

  it("falls back to the singular public reply when the list is empty", () => {
    const data = build({
      ...minimal,
      publicReplyEnabled: true,
      publicReplyMessage: "Sent!",
    });
    expect(data.publicReplyMessages).toEqual(["Sent!"]);
  });

  it("stores no public replies when the feature is off", () => {
    const data = build({
      ...minimal,
      publicReplyEnabled: false,
      publicReplyMessages: ["Sent!"],
    });
    expect(data.publicReplyMessages).toEqual([]);
    expect(data.publicReplyMessage).toBeNull();
  });

  it("clears follow-gate copy when the gate is off", () => {
    const data = build({
      ...minimal,
      requireFollow: false,
      followPromptMessage: "Follow first",
      followPromptButtonLabel: "Follow",
    });
    expect(data.followPromptMessage).toBeNull();
    expect(data.followPromptButtonLabel).toBeNull();
  });

  it("carries the DM trigger flag through", () => {
    const data = build({ ...minimal, dmTriggerEnabled: true });
    expect(data.dmTriggerEnabled).toBe(true);
  });

  it("stamps the owning workspace and account", () => {
    const data = build(minimal);
    expect(data.workspaceId).toBe("workspace_1");
    expect(data.instagramAccountId).toBe("account_1");
  });
});
