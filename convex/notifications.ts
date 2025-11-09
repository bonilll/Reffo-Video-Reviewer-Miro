import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserDoc, getCurrentUserOrThrow } from "./utils/auth";

export const list = query({
  args: {},
  async handler(ctx) {
    const user = await getCurrentUserDoc(ctx);
    if (!user) return [];
    const rows = await ctx.db
      .query('notifications')
      .withIndex('byUserAndCreatedAt', (q) => q.eq('userId', user._id))
      .collect();
    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50)
      .map((n) => ({
        id: n._id,
        type: n.type,
        message: n.message,
        videoId: n.videoId ?? null,
        projectId: n.projectId ?? null,
        commentId: n.commentId ?? null,
        frame: n.frame ?? null,
        mentionText: n.mentionText ?? null,
        fromUserId: n.fromUserId ?? null,
        createdAt: n.createdAt,
        readAt: n.readAt ?? null,
      }));
  },
});

export const markRead = mutation({
  args: { notificationId: v.id('notifications') },
  async handler(ctx, { notificationId }) {
    const user = await getCurrentUserOrThrow(ctx);
    const n = await ctx.db.get(notificationId);
    if (!n || n.userId !== user._id) return;
    await ctx.db.patch(notificationId, { readAt: Date.now() });
  },
});

export const markAllRead = mutation({
  args: {},
  async handler(ctx) {
    const user = await getCurrentUserOrThrow(ctx);
    const rows = await ctx.db.query('notifications').withIndex('byUser', (q) => q.eq('userId', user._id)).collect();
    await Promise.all(rows.filter((r) => !r.readAt).map((r) => ctx.db.patch(r._id, { readAt: Date.now() })));
  },
});
