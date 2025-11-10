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
      const nextEmail = identity.email ?? existing.email;
      const nextName =
        identity.name ??
        identity.nickname ??
        identity.preferredUsername ??
        identity.email ??
        existing.name ??
        existing.email;
      const nextAvatar = identity.pictureUrl ?? existing.avatar;
      const needsPatch =
        existing.email !== nextEmail ||
        existing.name !== nextName ||
        existing.avatar !== nextAvatar;
      if (needsPatch) {
        await ctx.db.patch(existing._id, {
          email: nextEmail,
          name: nextName,
          avatar: nextAvatar,
          updatedAt: now,
        });
      }
      return existing._id;
    }

    if (!identity.email) {
      throw new ConvexError("EMAIL_REQUIRED");
    }

    // If no user by clerkId, try to attach by email to avoid duplicates
    const normalizedEmail = identity.email.toLowerCase();
    const byEmail = await ctx.db
      .query("users")
      .withIndex("byEmail", (q) => q.eq("email", normalizedEmail))
      .collect();
    if (byEmail.length > 0) {
      const chosen = byEmail.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
      await ctx.db.patch(chosen._id, {
        clerkId: identity.subject,
        email: normalizedEmail,
        name:
          identity.name ??
          identity.nickname ??
          identity.preferredUsername ??
          normalizedEmail,
        avatar: identity.pictureUrl ?? chosen.avatar,
        updatedAt: now,
      });
      return chosen._id;
    }

    const userId = await ctx.db.insert("users", {
      clerkId: identity.subject,
      email: normalizedEmail,
      name:
        identity.name ??
        identity.nickname ??
        identity.preferredUsername ??
        normalizedEmail,
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
