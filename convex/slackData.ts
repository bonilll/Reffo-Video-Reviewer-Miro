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
    const rows = await ctx.db.query("slackConnections").withIndex("byUser", (q) => q.eq("userId", user._id)).collect();
    if (!rows.length) return [];
    return rows.map((row) => ({
      id: row._id,
      teamId: row.teamId,
      teamName: row.teamName,
      botUserId: row.botUserId,
      slackUserId: row.slackUserId,
      connectedAt: row.createdAt,
    }));
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
    const existing = await ctx.db
      .query("slackConnections")
      .withIndex("byUserAndTeam", (q) => q.eq("userId", userId).eq("teamId", teamId))
      .unique();
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
  args: { userId: v.id("users"), teamId: v.optional(v.string()) },
  async handler(ctx, { userId, teamId }) {
    if (teamId) {
      const existing = await ctx.db
        .query("slackConnections")
        .withIndex("byUserAndTeam", (q) => q.eq("userId", userId).eq("teamId", teamId))
        .unique();
      if (existing) await ctx.db.delete(existing._id);
      return;
    }
    const list = await ctx.db.query("slackConnections").withIndex("byUser", (q) => q.eq("userId", userId)).collect();
    for (const row of list) await ctx.db.delete(row._id);
  },
});

export const getConnectionSecrets = internalMutation({
  args: { userId: v.id("users") },
  async handler(ctx, { userId }) {
    const rows = await ctx.db.query("slackConnections").withIndex("byUser", (q) => q.eq("userId", userId)).collect();
    return rows.map((row) => ({ accessToken: row.accessToken, slackUserId: row.slackUserId }));
  },
});

export const buildMentionPayload = query({
  args: {
    toUserId: v.id("users"),
    videoId: v.id("videos"),
    commentId: v.id("comments"),
  },
  async handler(ctx, { toUserId, videoId, commentId }) {
    const conns = await ctx.db.query("slackConnections").withIndex("byUser", (q) => q.eq("userId", toUserId)).collect();
    const [video, comment] = await Promise.all([ctx.db.get(videoId), ctx.db.get(commentId)]);
    if (!video || !comment) return null;
    const [project, author] = await Promise.all([
      video.projectId ? ctx.db.get(video.projectId) : Promise.resolve(null),
      ctx.db.get(comment.authorId),
    ]);
    return {
      connections: conns.map((row) => ({ accessToken: row.accessToken, slackUserId: row.slackUserId })),
      video: { id: videoId, title: video.title, projectId: video.projectId ?? null },
      project: project ? { id: project._id as Id<"projects">, name: (project as any).name as string } : null,
      author: { name: (author as any)?.name ?? (author as any)?.email ?? "Someone" },
      comment: { text: comment.text, frame: comment.frame ?? null, authorId: comment.authorId },
    };
  },
});

// OAuth state helpers (nonce creation & consumption)
export const createOauthState = internalMutation({
  args: { provider: v.string(), userId: v.id("users"), nonce: v.string() },
  async handler(ctx, { provider, userId, nonce }) {
    await ctx.db.insert('oauthStates', { provider, nonce, userId, createdAt: Date.now() });
    return { ok: true };
  },
});

export const consumeOauthState = internalMutation({
  args: { provider: v.string(), nonce: v.string() },
  async handler(ctx, { provider, nonce }) {
    const row = await ctx.db.query('oauthStates').withIndex('byProviderAndNonce', (q) => q.eq('provider', provider).eq('nonce', nonce)).unique();
    if (!row) return null;
    // Expire states older than 15 minutes
    const maxAgeMs = 15 * 60 * 1000;
    if (Date.now() - row.createdAt > maxAgeMs) {
      await ctx.db.delete(row._id);
      return null;
    }
    await ctx.db.delete(row._id);
    return { userId: row.userId as Id<'users'> };
  },
});
