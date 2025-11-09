import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { getCurrentUserDoc, getCurrentUserOrThrow } from "./utils/auth";

export const list = query({
  args: {},
  async handler(ctx) {
    const user = await getCurrentUserDoc(ctx);
    if (!user) return [];
    const rows = await ctx.db.query('friends').withIndex('byOwner', (q) => q.eq('ownerId', user._id)).collect();
    return rows.map((r) => ({ id: r._id, contactUserId: r.contactUserId ?? null, contactEmail: r.contactEmail, contactName: r.contactName ?? null }));
  },
});

export const add = mutation({
  args: { email: v.string(), name: v.optional(v.string()) },
  async handler(ctx, { email, name }) {
    const user = await getCurrentUserOrThrow(ctx);
    const existing = await ctx.db
      .query('friends')
      .withIndex('byOwner', (q) => q.eq('ownerId', user._id))
      .filter((q) => q.eq(q.field('contactEmail'), email.toLowerCase()))
      .first();
    if (existing) return existing._id;
    // Handle potential duplicate users by email; choose the most recently updated.
    const contactDocs = await ctx.db
      .query('users')
      .withIndex('byEmail', (q) => q.eq('email', email.toLowerCase()))
      .collect();
    const contact = contactDocs.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0] ?? null;
    return await ctx.db.insert('friends', {
      ownerId: user._id,
      contactUserId: contact?._id,
      contactEmail: email.toLowerCase(),
      contactName: name ?? contact?.name,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { friendId: v.id('friends') },
  async handler(ctx, { friendId }) {
    const user = await getCurrentUserOrThrow(ctx);
    const row = await ctx.db.get(friendId);
    if (!row || row.ownerId !== user._id) throw new ConvexError('NOT_FOUND');
    await ctx.db.delete(friendId);
  },
});
