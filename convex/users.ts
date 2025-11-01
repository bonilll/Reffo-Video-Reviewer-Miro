import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { getCurrentUserDoc, getIdentityOrThrow, getCurrentUserOrThrow } from "./utils/auth";

const sanitizeUser = (user: Awaited<ReturnType<typeof getCurrentUserDoc>>) => {
  if (!user) return null;
  const { _id, name, email, avatar, createdAt, updatedAt } = user;
  return {
    _id,
    name: name ?? null,
    email,
    avatar: avatar ?? null,
    createdAt,
    updatedAt,
  };
};

export const ensure = mutation({
  args: {},
  async handler(ctx) {
    const identity = await getIdentityOrThrow(ctx);
    const now = Date.now();

    const existing = await ctx.db
      .query("users")
      .withIndex("byClerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: identity.email ?? existing.email,
        name:
          identity.name ??
          identity.nickname ??
          identity.preferredUsername ??
          identity.email ??
          existing.name ??
          existing.email,
        avatar: identity.pictureUrl ?? existing.avatar,
        updatedAt: now,
      });
      return existing._id;
    }

    if (!identity.email) {
      throw new ConvexError("EMAIL_REQUIRED");
    }

    const userId = await ctx.db.insert("users", {
      clerkId: identity.subject,
      email: identity.email,
      name:
        identity.name ??
        identity.nickname ??
        identity.preferredUsername ??
        identity.email,
      avatar: identity.pictureUrl,
      createdAt: now,
      updatedAt: now,
    });

    return userId;
  },
});

export const current = query({
  args: {},
  async handler(ctx) {
    const user = await getCurrentUserDoc(ctx);
    if (!user) {
      return null;
    }
    return sanitizeUser(user);
  },
});

export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    avatar: v.optional(v.string()),
  },
  async handler(ctx, { name, avatar }) {
    const user = await getCurrentUserOrThrow(ctx);
    await ctx.db.patch(user._id, {
      name: name ?? user.name,
      avatar: avatar ?? user.avatar,
      updatedAt: Date.now(),
    });
  },
});
