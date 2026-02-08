import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { getCurrentUserDoc, getIdentityOrThrow, getCurrentUserOrThrow } from "./utils/auth";
import { AvatarSource, effectiveAvatar, normalizeAvatarSource } from "./utils/avatar";

const looksLikeUploadedAvatarUrl = (url: string) =>
  url.includes("/video_review/users/") && url.includes("/profile/avatar-");

const sanitizeUser = (user: Awaited<ReturnType<typeof getCurrentUserDoc>>) => {
  if (!user) return null;
  const { _id, name, email, avatar, customAvatar, createdAt, updatedAt } = user as any;
  const avatarSource =
    normalizeAvatarSource((user as any).avatarSource) ??
    (customAvatar ? ("custom" as const) : ("auth" as const));
  return {
    _id,
    name: name ?? null,
    email,
    // Backwards-compatible: expose the effective avatar URL (auth vs custom).
    avatar: effectiveAvatar(user as any),
    authAvatar: avatar ?? null,
    customAvatar: customAvatar ?? null,
    avatarSource,
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

      // Migration: older versions stored a user-uploaded avatar in `avatar`. If it looks like our uploaded URL,
      // move it to `customAvatar` so `avatar` can keep tracking the auth-provider image.
      const canMigrateCustom =
        !existing.customAvatar &&
        typeof existing.avatar === "string" &&
        Boolean(identity.pictureUrl) &&
        existing.avatar !== identity.pictureUrl &&
        looksLikeUploadedAvatarUrl(existing.avatar);

      const nextAvatarSource: AvatarSource =
        canMigrateCustom
          ? "custom"
          : normalizeAvatarSource(existing.avatarSource) ??
            (existing.customAvatar ? ("custom" as const) : ("auth" as const));

      const needsPatch =
        existing.email !== nextEmail ||
        existing.name !== nextName ||
        existing.avatar !== nextAvatar ||
        canMigrateCustom ||
        (existing.avatarSource ?? null) !== nextAvatarSource;
      if (needsPatch) {
        const patch: any = {
          email: nextEmail,
          name: nextName,
          updatedAt: now,
        };
        if (canMigrateCustom) {
          patch.customAvatar = existing.avatar;
          patch.avatar = identity.pictureUrl;
          patch.avatarSource = "custom";
        } else {
          patch.avatar = nextAvatar;
          patch.avatarSource = nextAvatarSource;
        }

        await ctx.db.patch(existing._id, patch);
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
      const canMigrateCustom =
        !chosen.customAvatar &&
        typeof chosen.avatar === "string" &&
        Boolean(identity.pictureUrl) &&
        chosen.avatar !== identity.pictureUrl &&
        looksLikeUploadedAvatarUrl(chosen.avatar);

      const nextAvatarSource: AvatarSource =
        canMigrateCustom
          ? "custom"
          : normalizeAvatarSource(chosen.avatarSource) ??
            (chosen.customAvatar ? ("custom" as const) : ("auth" as const));

      await ctx.db.patch(chosen._id, {
        clerkId: identity.subject,
        email: normalizedEmail,
        name:
          identity.name ??
          identity.nickname ??
          identity.preferredUsername ??
          normalizedEmail,
        avatar: identity.pictureUrl ?? chosen.avatar,
        customAvatar: canMigrateCustom ? chosen.avatar : chosen.customAvatar,
        avatarSource: nextAvatarSource,
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
      customAvatar: undefined,
      avatarSource: "auth",
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
    avatarSource: v.optional(v.union(v.literal("auth"), v.literal("custom"))),
  },
  async handler(ctx, { name, avatar, avatarSource }) {
    const user = await getCurrentUserOrThrow(ctx);
    const patch: any = {
      name: name ?? user.name,
      updatedAt: Date.now(),
    };

    // `avatar` is treated as the user-chosen (custom) avatar. Auth-provider avatar is tracked separately.
    if (avatar !== undefined) {
      const cleaned = avatar.trim();
      patch.customAvatar = cleaned ? cleaned : undefined;
      if (!avatarSource) {
        patch.avatarSource = cleaned ? "custom" : "auth";
      }
    }

    if (avatarSource) {
      patch.avatarSource = avatarSource;
    }

    await ctx.db.patch(user._id, patch);
  },
});
