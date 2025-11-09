import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

export const status = query({
  args: {},
  async handler(ctx) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("byClerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return null;
    const row = await ctx.db.query("slackConnections").withIndex("byUser", (q) => q.eq("userId", user._id)).unique();
    if (!row) return null;
    return {
      teamId: row.teamId,
      teamName: row.teamName,
      botUserId: row.botUserId,
      slackUserId: row.slackUserId,
      connectedAt: row.createdAt,
    };
  },
});

export const upsertConnection = internalMutation({
  args: {
    userId: v.id("users"),
    teamId: v.string(),
    teamName: v.string(),
    botUserId: v.string(),
    slackUserId: v.string(),
    accessToken: v.string(),
  },
  async handler(ctx, { userId, teamId, teamName, botUserId, slackUserId, accessToken }) {
    const existing = await ctx.db.query("slackConnections").withIndex("byUser", (q) => q.eq("userId", userId)).unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        teamId,
        teamName,
        botUserId,
        slackUserId,
        accessToken,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("slackConnections", {
        userId,
        teamId,
        teamName,
        botUserId,
        slackUserId,
        accessToken,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

export const deleteForUser = internalMutation({
  args: { userId: v.id("users") },
  async handler(ctx, { userId }) {
    const existing = await ctx.db.query("slackConnections").withIndex("byUser", (q) => q.eq("userId", userId)).unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

export const getConnectionSecret = internalMutation({
  args: { userId: v.id("users") },
  async handler(ctx, { userId }) {
    const row = await ctx.db.query("slackConnections").withIndex("byUser", (q) => q.eq("userId", userId)).unique();
    if (!row) return null;
    return { accessToken: row.accessToken, slackUserId: row.slackUserId };
  },
});

export const buildMentionPayload = query({
  args: {
    toUserId: v.id("users"),
    videoId: v.id("videos"),
    commentId: v.id("comments"),
  },
  async handler(ctx, { toUserId, videoId, commentId }) {
    const conn = await ctx.db.query("slackConnections").withIndex("byUser", (q) => q.eq("userId", toUserId)).unique();
    const [video, comment] = await Promise.all([ctx.db.get(videoId), ctx.db.get(commentId)]);
    if (!video || !comment) return null;
    const [project, author] = await Promise.all([
      video.projectId ? ctx.db.get(video.projectId) : Promise.resolve(null),
      ctx.db.get(comment.authorId),
    ]);
    return {
      connection: conn
        ? { accessToken: conn.accessToken, slackUserId: conn.slackUserId }
        : null,
      video: { id: videoId, title: video.title, projectId: video.projectId ?? null },
      project: project ? { id: project._id as Id<"projects">, name: (project as any).name as string } : null,
      author: { name: (author as any)?.name ?? (author as any)?.email ?? "Someone" },
      comment: { text: comment.text, frame: comment.frame ?? null, authorId: comment.authorId },
    };
  },
});


