import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { getCurrentUserDoc, getIdentityOrThrow, getCurrentUserOrThrow } from "./utils/auth";
import { AvatarSource, effectiveAvatar, normalizeAvatarSource } from "./utils/avatar";
import { internal } from "./_generated/api";

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

const normalizeEmail = (value?: string | null) => value?.trim().toLowerCase() ?? "";

const hasPatchValues = (patch: Record<string, any>) =>
  Object.values(patch).some((v) => v !== undefined);

export const deleteAccount = mutation({
  args: {
    confirm: v.boolean(),
  },
  async handler(ctx, { confirm }) {
    if (!confirm) {
      throw new ConvexError("CONFIRM_REQUIRED");
    }

    const user = await getCurrentUserOrThrow(ctx);
    const now = Date.now();
    const selfEmail = normalizeEmail(user.email);

    const usersByIdCache = new Map<string, any | null>();
    const usersByEmailCache = new Map<string, any | null>();

    const getUserById = async (userId?: string | null) => {
      if (!userId) return null;
      if (usersByIdCache.has(userId)) return usersByIdCache.get(userId) ?? null;
      const doc = await ctx.db.get(userId as any);
      usersByIdCache.set(userId, doc ?? null);
      return doc ?? null;
    };

    const getUserByEmail = async (email?: string | null) => {
      const normalized = normalizeEmail(email);
      if (!normalized) return null;
      if (usersByEmailCache.has(normalized)) return usersByEmailCache.get(normalized) ?? null;
      const docs = await ctx.db
        .query("users")
        .withIndex("byEmail", (q) => q.eq("email", normalized))
        .collect();
      const chosen =
        docs.sort((a: any, b: any) => {
          const aHas = a.clerkId ? 1 : 0;
          const bHas = b.clerkId ? 1 : 0;
          if (aHas !== bHas) return bHas - aHas;
          return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
        })[0] ?? null;
      usersByEmailCache.set(normalized, chosen);
      return chosen;
    };

    const resolveExternalUserId = async (userId?: string | null, email?: string | null) => {
      if (userId && userId !== (user._id as string)) {
        const byId = await getUserById(userId);
        if (byId && byId._id !== user._id) return byId._id as any;
      }
      const byEmail = await getUserByEmail(email);
      if (byEmail && byEmail._id !== user._id) return byEmail._id as any;
      return null;
    };

    const candidateCount = new Map<string, number>();
    const countCandidate = (candidateId?: string | null) => {
      if (!candidateId || candidateId === (user._id as string)) return;
      candidateCount.set(candidateId, (candidateCount.get(candidateId) ?? 0) + 1);
    };

    // Candidate recipients from sharing relationships
    const ownedGroupsForScan = await ctx.db
      .query("shareGroups")
      .withIndex("byOwner", (q) => q.eq("ownerId", user._id))
      .collect();
    for (const group of ownedGroupsForScan) {
      const members = await ctx.db
        .query("shareGroupMembers")
        .withIndex("byGroup", (q) => q.eq("groupId", group._id))
        .collect();
      for (const member of members) {
        const candidate = await resolveExternalUserId(
          (member.userId as any) ?? null,
          member.email ?? null,
        );
        countCandidate(candidate as any);
      }
    }

    const ownedBoardsForScan = await ctx.db
      .query("boards")
      .withIndex("byOwner", (q) => q.eq("ownerId", user._id))
      .collect();
    for (const board of ownedBoardsForScan) {
      const boardShares = await ctx.db
        .query("boardSharing")
        .withIndex("byBoard", (q) => q.eq("boardId", board._id))
        .collect();
      for (const share of boardShares) {
        const candidate = await resolveExternalUserId(
          (share.userId as any) ?? null,
          share.userEmail ?? null,
        );
        countCandidate(candidate as any);
      }
    }

    const ownedCollectionsForScan = await ctx.db
      .query("assetCollections")
      .withIndex("byOwner", (q) => q.eq("ownerId", user._id))
      .collect();
    for (const collection of ownedCollectionsForScan) {
      const colShares = await ctx.db
        .query("assetCollectionSharing")
        .withIndex("byCollection", (q) => q.eq("collectionId", collection._id))
        .collect();
      for (const share of colShares) {
        const direct = await resolveExternalUserId(
          (share.userId as any) ?? null,
          share.userEmail ?? null,
        );
        countCandidate(direct as any);
        if (!direct && share.groupId) {
          const members = await ctx.db
            .query("shareGroupMembers")
            .withIndex("byGroup", (q) => q.eq("groupId", share.groupId as any))
            .collect();
          for (const member of members) {
            const candidate = await resolveExternalUserId(
              (member.userId as any) ?? null,
              member.email ?? null,
            );
            countCandidate(candidate as any);
          }
        }
      }
    }

    const ownedSharesForScan = await ctx.db
      .query("contentShares")
      .withIndex("byOwner", (q) => q.eq("ownerId", user._id))
      .collect();
    for (const share of ownedSharesForScan) {
      if (!share.groupId) continue;
      const members = await ctx.db
        .query("shareGroupMembers")
        .withIndex("byGroup", (q) => q.eq("groupId", share.groupId as any))
        .collect();
      for (const member of members) {
        const candidate = await resolveExternalUserId(
          (member.userId as any) ?? null,
          member.email ?? null,
        );
        countCandidate(candidate as any);
      }
    }

    let defaultRecipientId: any = null;
    let defaultRecipientScore = -1;
    for (const [candidateId, score] of candidateCount.entries()) {
      if (score > defaultRecipientScore) {
        defaultRecipientId = candidateId as any;
        defaultRecipientScore = score;
      }
    }
    const defaultRecipientDoc = defaultRecipientId ? await getUserById(defaultRecipientId as any) : null;
    const defaultRecipientEmail = normalizeEmail(defaultRecipientDoc?.email ?? null);

    const chooseRecipientFromMembers = async (
      members: Array<{ userId?: any; email?: string | null }>,
    ) => {
      for (const member of members) {
        const candidate = await resolveExternalUserId(
          (member.userId as any) ?? null,
          member.email ?? null,
        );
        if (candidate) return candidate as any;
      }
      return defaultRecipientId as any;
    };

    const storageKeysToDelete = new Set<string>();
    const publicUrlsToDelete = new Set<string>();

    const scheduleStorageDeleteByKey = (key?: string | null) => {
      if (key) storageKeysToDelete.add(key);
    };
    const scheduleStorageDeleteByUrl = (url?: string | null) => {
      if (url) publicUrlsToDelete.add(url);
    };

    const counters = {
      transferredProjects: 0,
      deletedProjects: 0,
      transferredVideos: 0,
      deletedVideos: 0,
      transferredBoards: 0,
      deletedBoards: 0,
      transferredCollections: 0,
      deletedCollections: 0,
      transferredGroups: 0,
      deletedGroups: 0,
      transferredAssets: 0,
      deletedAssets: 0,
    };

    const transferredProjectOwner = new Map<string, any>();
    const transferredVideoIds = new Set<string>();
    const transferredBoardIds = new Set<string>();
    const transferredCollectionIds = new Set<string>();
    const transferredGroupIds = new Set<string>();
    const keepAssetIds = new Set<string>();

    // 1) Projects
    const ownedProjects = await ctx.db
      .query("projects")
      .withIndex("byOwner", (q) => q.eq("ownerId", user._id))
      .collect();

    for (const project of ownedProjects) {
      const projectShares = await ctx.db
        .query("contentShares")
        .withIndex("byProject", (q) => q.eq("projectId", project._id))
        .collect();

      const shareMembers: Array<{ userId?: any; email?: string | null }> = [];
      for (const share of projectShares) {
        if (!share.groupId) continue;
        const members = await ctx.db
          .query("shareGroupMembers")
          .withIndex("byGroup", (q) => q.eq("groupId", share.groupId as any))
          .collect();
        members.forEach((m) => shareMembers.push({ userId: m.userId, email: m.email }));
      }
      const recipientId = projectShares.length > 0
        ? await chooseRecipientFromMembers(shareMembers)
        : null;

      if (projectShares.length > 0 && recipientId) {
        await ctx.db.patch(project._id, {
          ownerId: recipientId,
          updatedAt: now,
        });
        transferredProjectOwner.set(project._id as any, recipientId);
        counters.transferredProjects += 1;
        for (const share of projectShares) {
          await ctx.db.patch(share._id, { ownerId: recipientId });
        }
      } else {
        for (const share of projectShares) {
          await ctx.db.delete(share._id);
        }
      }
    }

    // 2) Videos
    const ownedVideos = await ctx.db
      .query("videos")
      .withIndex("byOwner", (q) => q.eq("ownerId", user._id))
      .collect();

    for (const video of ownedVideos) {
      const videoShares = await ctx.db
        .query("contentShares")
        .withIndex("byVideo", (q) => q.eq("videoId", video._id))
        .collect();

      let recipientId: any = null;
      if (video.projectId && transferredProjectOwner.has(video.projectId as any)) {
        recipientId = transferredProjectOwner.get(video.projectId as any) as any;
      } else if (videoShares.length > 0) {
        const members: Array<{ userId?: any; email?: string | null }> = [];
        for (const share of videoShares) {
          if (!share.groupId) continue;
          const groupMembers = await ctx.db
            .query("shareGroupMembers")
            .withIndex("byGroup", (q) => q.eq("groupId", share.groupId as any))
            .collect();
          groupMembers.forEach((m) => members.push({ userId: m.userId, email: m.email }));
        }
        recipientId = await chooseRecipientFromMembers(members);
      }

      if (recipientId) {
        const patch: any = {
          ownerId: recipientId,
        };
        if (video.projectId && !transferredProjectOwner.has(video.projectId as any)) {
          patch.projectId = undefined;
        }
        await ctx.db.patch(video._id, patch);
        for (const share of videoShares) {
          await ctx.db.patch(share._id, { ownerId: recipientId });
        }
        transferredVideoIds.add(video._id as any);
        counters.transferredVideos += 1;
      } else {
        const annotations = await ctx.db
          .query("annotations")
          .withIndex("byVideo", (q) => q.eq("videoId", video._id))
          .collect();
        const comments = await ctx.db
          .query("comments")
          .withIndex("byVideo", (q) => q.eq("videoId", video._id))
          .collect();
        const revisions = await ctx.db
          .query("videoRevisions")
          .withIndex("byVideo", (q) => q.eq("videoId", video._id))
          .collect();
        const usages = await ctx.db
          .query("assetUsages")
          .withIndex("byVideo", (q) => q.eq("videoId", video._id))
          .collect();

        for (const row of annotations) await ctx.db.delete(row._id);
        for (const row of comments) await ctx.db.delete(row._id);
        for (const row of videoShares) await ctx.db.delete(row._id);
        for (const row of revisions) {
          scheduleStorageDeleteByKey(row.storageKey);
          scheduleStorageDeleteByUrl(row.thumbnailUrl ?? null);
          await ctx.db.delete(row._id);
        }
        for (const row of usages) await ctx.db.delete(row._id);

        scheduleStorageDeleteByKey(video.storageKey);
        scheduleStorageDeleteByUrl(video.thumbnailUrl ?? null);
        await ctx.db.delete(video._id);
        counters.deletedVideos += 1;
      }
    }

    // 3) Boards
    const ownedBoards = await ctx.db
      .query("boards")
      .withIndex("byOwner", (q) => q.eq("ownerId", user._id))
      .collect();

    for (const board of ownedBoards) {
      const boardShares = await ctx.db
        .query("boardSharing")
        .withIndex("byBoard", (q) => q.eq("boardId", board._id))
        .collect();
      const shareMembers = boardShares.map((share) => ({
        userId: share.userId,
        email: share.userEmail ?? null,
      }));
      const recipientId = boardShares.length > 0
        ? await chooseRecipientFromMembers(shareMembers)
        : null;

      if (boardShares.length > 0 && recipientId) {
        const recipientDoc = await getUserById(recipientId as any);
        await ctx.db.patch(board._id, {
          ownerId: recipientId,
          ownerName: recipientDoc?.name ?? recipientDoc?.email ?? board.ownerName,
          updatedAt: now,
        });
        transferredBoardIds.add(board._id as any);
        counters.transferredBoards += 1;

        for (const share of boardShares) {
          const patch: any = {};
          if (share.invitedBy === user._id) {
            patch.invitedBy = recipientId;
          }
          if (!share.userId && share.userEmail) {
            const byEmail = await resolveExternalUserId(null, share.userEmail);
            if (byEmail) patch.userId = byEmail;
          }
          if (hasPatchValues(patch)) {
            await ctx.db.patch(share._id, patch);
          }
        }
      } else {
        for (const share of boardShares) {
          await ctx.db.delete(share._id);
        }
        const mediaRows = await ctx.db
          .query("media")
          .withIndex("byBoard", (q) => q.eq("boardId", board._id))
          .collect();
        for (const media of mediaRows) {
          await ctx.db.delete(media._id);
        }
        const accessRequests = await ctx.db
          .query("boardAccessRequests")
          .withIndex("byBoard", (q) => q.eq("boardId", board._id))
          .collect();
        for (const req of accessRequests) {
          await ctx.db.delete(req._id);
        }
        await ctx.db.delete(board._id);
        counters.deletedBoards += 1;
      }
    }

    // 4) Asset collections
    const ownedCollections = await ctx.db
      .query("assetCollections")
      .withIndex("byOwner", (q) => q.eq("ownerId", user._id))
      .collect();

    for (const collection of ownedCollections) {
      const shares = await ctx.db
        .query("assetCollectionSharing")
        .withIndex("byCollection", (q) => q.eq("collectionId", collection._id))
        .collect();

      const shareMembers: Array<{ userId?: any; email?: string | null }> = [];
      for (const share of shares) {
        shareMembers.push({ userId: share.userId, email: share.userEmail ?? null });
        if (share.groupId) {
          const groupMembers = await ctx.db
            .query("shareGroupMembers")
            .withIndex("byGroup", (q) => q.eq("groupId", share.groupId as any))
            .collect();
          groupMembers.forEach((m) => shareMembers.push({ userId: m.userId, email: m.email }));
        }
      }
      const recipientId = shares.length > 0
        ? await chooseRecipientFromMembers(shareMembers)
        : null;

      if (shares.length > 0 && recipientId) {
        await ctx.db.patch(collection._id, {
          ownerId: recipientId,
          updatedAt: now,
        });
        transferredCollectionIds.add(collection._id as any);
        counters.transferredCollections += 1;

        const items = await ctx.db
          .query("assetCollectionItems")
          .withIndex("byCollection", (q) => q.eq("collectionId", collection._id))
          .collect();
        items.forEach((item) => keepAssetIds.add(item.assetId as any));

        for (const share of shares) {
          const patch: any = {};
          if (share.invitedBy === user._id) patch.invitedBy = recipientId;
          if (!share.userId && share.userEmail) {
            const byEmail = await resolveExternalUserId(null, share.userEmail);
            if (byEmail) patch.userId = byEmail;
          }
          if (hasPatchValues(patch)) {
            await ctx.db.patch(share._id, patch);
          }
        }
      } else {
        const items = await ctx.db
          .query("assetCollectionItems")
          .withIndex("byCollection", (q) => q.eq("collectionId", collection._id))
          .collect();
        for (const item of items) {
          await ctx.db.delete(item._id);
        }
        for (const share of shares) {
          await ctx.db.delete(share._id);
        }
        scheduleStorageDeleteByKey((collection as any).coverStorageKey ?? null);
        await ctx.db.delete(collection._id);
        counters.deletedCollections += 1;
      }
    }

    // 5) Share groups
    const ownedGroups = await ctx.db
      .query("shareGroups")
      .withIndex("byOwner", (q) => q.eq("ownerId", user._id))
      .collect();

    for (const group of ownedGroups) {
      const members = await ctx.db
        .query("shareGroupMembers")
        .withIndex("byGroup", (q) => q.eq("groupId", group._id))
        .collect();
      const groupContentShares = (await ctx.db.query("contentShares").collect()).filter(
        (s) => s.groupId === group._id,
      );

      const recipientId = await chooseRecipientFromMembers(
        members.map((m) => ({ userId: m.userId, email: m.email })),
      );

      if (recipientId) {
        const recipientDoc = await getUserById(recipientId as any);
        const recipientEmail = normalizeEmail(recipientDoc?.email ?? null);
        await ctx.db.patch(group._id, {
          ownerId: recipientId,
          updatedAt: now,
        });
        transferredGroupIds.add(group._id as any);
        counters.transferredGroups += 1;

        let recipientMemberId: any = null;
        for (const member of members) {
          const memberEmail = normalizeEmail(member.email);
          const shouldDeleteMember =
            (member.userId && member.userId === user._id) ||
            (!!selfEmail && memberEmail === selfEmail);
          if (shouldDeleteMember) {
            await ctx.db.delete(member._id);
            continue;
          }

          if (
            (member.userId && member.userId === recipientId) ||
            (!!recipientEmail && memberEmail === recipientEmail)
          ) {
            recipientMemberId = member._id;
            await ctx.db.patch(member._id, {
              userId: recipientId,
              email: recipientEmail || member.email,
              role: "owner",
              status: "active",
              acceptedAt: member.acceptedAt ?? now,
            });
          }
        }

        if (!recipientMemberId && recipientEmail) {
          await ctx.db.insert("shareGroupMembers", {
            groupId: group._id,
            email: recipientEmail,
            userId: recipientId,
            role: "owner",
            status: "active",
            invitedAt: now,
            acceptedAt: now,
          });
        }

        for (const share of groupContentShares) {
          await ctx.db.patch(share._id, { ownerId: recipientId });
        }

        const collectionShares = await ctx.db
          .query("assetCollectionSharing")
          .withIndex("byGroup", (q) => q.eq("groupId", group._id))
          .collect();
        for (const share of collectionShares) {
          if (share.invitedBy === user._id) {
            await ctx.db.patch(share._id, { invitedBy: recipientId });
          }
        }
      } else {
        for (const share of groupContentShares) {
          await ctx.db.delete(share._id);
        }
        const collectionShares = await ctx.db
          .query("assetCollectionSharing")
          .withIndex("byGroup", (q) => q.eq("groupId", group._id))
          .collect();
        for (const share of collectionShares) {
          await ctx.db.delete(share._id);
        }
        for (const member of members) {
          await ctx.db.delete(member._id);
        }
        await ctx.db.delete(group._id);
        counters.deletedGroups += 1;
      }
    }

    // 6) Projects not transferred: remove and detach foreign project links
    for (const project of ownedProjects) {
      if (transferredProjectOwner.has(project._id as any)) continue;

      const boardsInProject = await ctx.db
        .query("boards")
        .withIndex("byProject", (q) => q.eq("projectId", project._id))
        .collect();
      for (const board of boardsInProject) {
        await ctx.db.patch(board._id, { projectId: undefined, updatedAt: now });
      }

      const collectionsInProject = await ctx.db
        .query("assetCollections")
        .withIndex("byProject", (q) => q.eq("projectId", project._id))
        .collect();
      for (const collection of collectionsInProject) {
        await ctx.db.patch(collection._id, { projectId: undefined, updatedAt: now });
      }

      await ctx.db.delete(project._id);
      counters.deletedProjects += 1;
    }

    // 7) Assets
    const ownedAssets = await ctx.db
      .query("assets")
      .withIndex("byUser", (q) => q.eq("userId", user._id))
      .collect();

    for (const asset of ownedAssets) {
      const shouldTransfer = !!defaultRecipientId && keepAssetIds.has(asset._id as any);
      if (shouldTransfer) {
        await ctx.db.patch(asset._id, {
          userId: defaultRecipientId,
          updatedAt: now,
        });
        counters.transferredAssets += 1;

        const usages = await ctx.db
          .query("assetUsages")
          .withIndex("byAsset", (q) => q.eq("assetId", asset._id))
          .collect();
        for (const usage of usages) {
          if (usage.userId === user._id) {
            await ctx.db.patch(usage._id, { userId: defaultRecipientId });
          }
        }

        const jobs = await ctx.db
          .query("assetAnalysisJobs")
          .withIndex("byAsset", (q) => q.eq("assetId", asset._id))
          .collect();
        for (const job of jobs) {
          if (job.userId === user._id) {
            await ctx.db.patch(job._id, { userId: defaultRecipientId, updatedAt: now });
          }
        }
        continue;
      }

      const items = await ctx.db
        .query("assetCollectionItems")
        .withIndex("byAsset", (q) => q.eq("assetId", asset._id))
        .collect();
      for (const item of items) await ctx.db.delete(item._id);

      const usages = await ctx.db
        .query("assetUsages")
        .withIndex("byAsset", (q) => q.eq("assetId", asset._id))
        .collect();
      for (const usage of usages) await ctx.db.delete(usage._id);

      const jobs = await ctx.db
        .query("assetAnalysisJobs")
        .withIndex("byAsset", (q) => q.eq("assetId", asset._id))
        .collect();
      for (const job of jobs) await ctx.db.delete(job._id);

      scheduleStorageDeleteByKey((asset as any).storageKey ?? null);
      const variants = (asset as any).variants;
      if (variants && typeof variants === "object") {
        for (const key of Object.keys(variants)) {
          const storageKey = variants[key]?.storageKey;
          if (storageKey) scheduleStorageDeleteByKey(storageKey);
        }
      }

      await ctx.db.delete(asset._id);
      counters.deletedAssets += 1;
    }

    // 8) Media rows not tied to transferred boards
    const mediaRows = await ctx.db
      .query("media")
      .withIndex("byUser", (q) => q.eq("userId", user._id))
      .collect();
    for (const media of mediaRows) {
      if (media.boardId && transferredBoardIds.has(media.boardId as any) && defaultRecipientId) {
        await ctx.db.patch(media._id, {
          userId: defaultRecipientId,
          userName: defaultRecipientDoc?.name ?? media.userName,
          userEmail: defaultRecipientDoc?.email ?? media.userEmail,
        });
      } else {
        await ctx.db.delete(media._id);
      }
    }

    // 9) Compositions + related
    const ownedCompositions = await ctx.db
      .query("compositions")
      .withIndex("byOwner", (q) => q.eq("ownerId", user._id))
      .collect();
    const transferredCompositionOwners = new Map<string, any>();

    for (const composition of ownedCompositions) {
      let recipientId: any = null;
      if (composition.projectId && transferredProjectOwner.has(composition.projectId as any)) {
        recipientId = transferredProjectOwner.get(composition.projectId as any);
      } else if (composition.sourceVideoId && transferredVideoIds.has(composition.sourceVideoId as any)) {
        const transferredVideo: any = await ctx.db.get(composition.sourceVideoId as any);
        recipientId = transferredVideo?.ownerId ?? defaultRecipientId;
      }

      if (recipientId) {
        await ctx.db.patch(composition._id, {
          ownerId: recipientId,
          updatedAt: now,
        });
        transferredCompositionOwners.set(composition._id as any, recipientId);
      } else {
        const clips = await ctx.db
          .query("compositionClips")
          .withIndex("byComposition", (q) => q.eq("compositionId", composition._id))
          .collect();
        for (const clip of clips) await ctx.db.delete(clip._id);

        const tracks = await ctx.db
          .query("keyframeTracks")
          .withIndex("byComposition", (q) => q.eq("compositionId", composition._id))
          .collect();
        for (const track of tracks) await ctx.db.delete(track._id);

        const exports = await ctx.db
          .query("compositionExports")
          .withIndex("byComposition", (q) => q.eq("compositionId", composition._id))
          .collect();
        for (const exp of exports) {
          if (exp.renderJobId) {
            await ctx.db.delete(exp.renderJobId as any);
          }
          await ctx.db.delete(exp._id);
        }

        const saves = await ctx.db
          .query("compositionSaves")
          .withIndex("byComposition", (q) => q.eq("compositionId", composition._id))
          .collect();
        for (const save of saves) await ctx.db.delete(save._id);

        const states = await ctx.db
          .query("compositionSaveStates")
          .withIndex("byComposition", (q) => q.eq("compositionId", composition._id))
          .collect();
        for (const state of states) await ctx.db.delete(state._id);

        await ctx.db.delete(composition._id);
      }
    }

    const ownedCompositionExports = await ctx.db
      .query("compositionExports")
      .withIndex("byOwner", (q) => q.eq("ownerId", user._id))
      .collect();
    for (const exp of ownedCompositionExports) {
      const composition: any = await ctx.db.get(exp.compositionId as any);
      if (composition?.ownerId && composition.ownerId !== user._id) {
        await ctx.db.patch(exp._id, {
          ownerId: composition.ownerId,
          updatedAt: now,
        });
      } else if (!composition) {
        await ctx.db.delete(exp._id);
      }
    }

    const ownedSaves = await ctx.db
      .query("compositionSaves")
      .withIndex("byOwner", (q) => q.eq("ownerId", user._id))
      .collect();
    for (const save of ownedSaves) {
      const composition: any = await ctx.db.get(save.compositionId as any);
      const nextOwner =
        composition?.ownerId && composition.ownerId !== user._id
          ? composition.ownerId
          : save.videoId && transferredVideoIds.has(save.videoId as any)
            ? defaultRecipientId
            : null;
      if (nextOwner) {
        await ctx.db.patch(save._id, { ownerId: nextOwner, updatedAt: now });
      } else {
        await ctx.db.delete(save._id);
      }
    }

    const ownedSaveStates = await ctx.db
      .query("compositionSaveStates")
      .withIndex("byOwnerAndComposition", (q) => q.eq("ownerId", user._id))
      .collect();
    for (const state of ownedSaveStates) {
      const composition: any = await ctx.db.get(state.compositionId as any);
      const nextOwner =
        composition?.ownerId && composition.ownerId !== user._id
          ? composition.ownerId
          : state.videoId && transferredVideoIds.has(state.videoId as any)
            ? defaultRecipientId
            : null;
      if (nextOwner) {
        await ctx.db.patch(state._id, { ownerId: nextOwner, updatedAt: now });
      } else {
        await ctx.db.delete(state._id);
      }
    }

    // 10) Todo data
    const todoLists = await ctx.db
      .query("todoLists")
      .withIndex("byOwner", (q) => q.eq("ownerId", user._id))
      .collect();
    for (const list of todoLists) {
      const items = await ctx.db
        .query("todoItems")
        .withIndex("byList", (q) => q.eq("listId", list._id))
        .collect();
      for (const item of items) await ctx.db.delete(item._id);
      await ctx.db.delete(list._id);
    }

    // 11) Clean references to this user
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("byUser", (q) => q.eq("userId", user._id))
      .collect();
    for (const row of settings) await ctx.db.delete(row._id);

    const slackConnections = await ctx.db
      .query("slackConnections")
      .withIndex("byUser", (q) => q.eq("userId", user._id))
      .collect();
    for (const row of slackConnections) await ctx.db.delete(row._id);

    const oauthStates = await ctx.db.query("oauthStates").collect();
    for (const row of oauthStates) {
      if (row.userId === user._id) await ctx.db.delete(row._id);
    }

    const consents = await ctx.db
      .query("cookieConsents")
      .withIndex("byUser", (q) => q.eq("userId", user._id))
      .collect();
    for (const row of consents) await ctx.db.delete(row._id);

    const legalRows = await ctx.db.query("legalAcceptances").collect();
    for (const row of legalRows) {
      if (row.userId === user._id) await ctx.db.delete(row._id);
    }

    const boardSharesByUser = await ctx.db
      .query("boardSharing")
      .withIndex("byUser", (q) => q.eq("userId", user._id))
      .collect();
    for (const row of boardSharesByUser) await ctx.db.delete(row._id);

    if (selfEmail) {
      const boardSharesByEmail = await ctx.db
        .query("boardSharing")
        .withIndex("byEmail", (q) => q.eq("userEmail", selfEmail))
        .collect();
      for (const row of boardSharesByEmail) await ctx.db.delete(row._id);
    }
    const allBoardSharingRows = await ctx.db.query("boardSharing").collect();
    for (const row of allBoardSharingRows) {
      if (row.invitedBy !== user._id) continue;
      const board: any = await ctx.db.get(row.boardId as any);
      const fallbackInviter = defaultRecipientId ?? board?.ownerId ?? null;
      if (!fallbackInviter) {
        await ctx.db.delete(row._id);
      } else {
        await ctx.db.patch(row._id, { invitedBy: fallbackInviter });
      }
    }

    const boardRequestsByUser = await ctx.db
      .query("boardAccessRequests")
      .withIndex("byRequester", (q) => q.eq("requesterId", user._id))
      .collect();
    for (const row of boardRequestsByUser) await ctx.db.delete(row._id);

    if (selfEmail) {
      const boardRequestsByEmail = await ctx.db
        .query("boardAccessRequests")
        .withIndex("byRequesterEmail", (q) => q.eq("requesterEmail", selfEmail))
        .collect();
      for (const row of boardRequestsByEmail) await ctx.db.delete(row._id);
    }

    const collectionSharesByUser = await ctx.db
      .query("assetCollectionSharing")
      .withIndex("byUser", (q) => q.eq("userId", user._id))
      .collect();
    for (const row of collectionSharesByUser) {
      if (!transferredCollectionIds.has(row.collectionId as any)) {
        await ctx.db.delete(row._id);
      }
    }
    if (selfEmail) {
      const collectionSharesByEmail = await ctx.db
        .query("assetCollectionSharing")
        .withIndex("byEmail", (q) => q.eq("userEmail", selfEmail))
        .collect();
      for (const row of collectionSharesByEmail) {
        if (!transferredCollectionIds.has(row.collectionId as any)) {
          await ctx.db.delete(row._id);
        }
      }
    }
    const allCollectionSharingRows = await ctx.db.query("assetCollectionSharing").collect();
    for (const row of allCollectionSharingRows) {
      if (row.invitedBy !== user._id) continue;
      const collection: any = await ctx.db.get(row.collectionId as any);
      const fallbackInviter = defaultRecipientId ?? collection?.ownerId ?? null;
      if (!fallbackInviter) {
        await ctx.db.delete(row._id);
      } else {
        await ctx.db.patch(row._id, { invitedBy: fallbackInviter });
      }
    }

    const groupMembersByEmail = selfEmail
      ? await ctx.db
          .query("shareGroupMembers")
          .withIndex("byEmail", (q) => q.eq("email", selfEmail))
          .collect()
      : [];
    for (const member of groupMembersByEmail) {
      if (!transferredGroupIds.has(member.groupId as any)) {
        await ctx.db.delete(member._id);
      }
    }
    const allGroupMembers = await ctx.db.query("shareGroupMembers").collect();
    for (const member of allGroupMembers) {
      if (member.userId !== user._id) continue;
      if (transferredGroupIds.has(member.groupId as any)) continue;
      await ctx.db.delete(member._id);
    }

    const myOwnedShares = await ctx.db
      .query("contentShares")
      .withIndex("byOwner", (q) => q.eq("ownerId", user._id))
      .collect();
    for (const share of myOwnedShares) {
      await ctx.db.delete(share._id);
    }

    const myNotifications = await ctx.db
      .query("notifications")
      .withIndex("byUser", (q) => q.eq("userId", user._id))
      .collect();
    for (const note of myNotifications) await ctx.db.delete(note._id);

    const allNotifications = await ctx.db.query("notifications").collect();
    for (const note of allNotifications) {
      if (note.userId === user._id) continue;
      if (note.fromUserId === user._id) {
        if (defaultRecipientId) {
          await ctx.db.patch(note._id, { fromUserId: defaultRecipientId });
        } else {
          await ctx.db.patch(note._id, { fromUserId: undefined });
        }
      }
    }

    const allAnnotations = await ctx.db.query("annotations").collect();
    for (const annotation of allAnnotations) {
      if (annotation.authorId === user._id) {
        await ctx.db.delete(annotation._id);
      }
    }

    const allComments = await ctx.db.query("comments").collect();
    const removedCommentIds = new Set<string>();
    for (const comment of allComments) {
      if (comment.authorId === user._id) {
        removedCommentIds.add(comment._id as any);
        await ctx.db.delete(comment._id);
      }
    }
    for (const note of allNotifications) {
      if (note.commentId && removedCommentIds.has(note.commentId as any)) {
        await ctx.db.delete(note._id);
      }
    }

    const myFriends = await ctx.db
      .query("friends")
      .withIndex("byOwner", (q) => q.eq("ownerId", user._id))
      .collect();
    for (const friend of myFriends) await ctx.db.delete(friend._id);

    const allFriends = await ctx.db.query("friends").collect();
    for (const friend of allFriends) {
      if (friend.contactUserId === user._id) {
        await ctx.db.patch(friend._id, { contactUserId: undefined });
      }
    }

    const myAssetJobs = await ctx.db
      .query("assetAnalysisJobs")
      .withIndex("byUserCreatedAt", (q) => q.eq("userId", user._id))
      .collect();
    for (const job of myAssetJobs) await ctx.db.delete(job._id);

    const myUsages = await ctx.db
      .query("assetUsages")
      .withIndex("byUser", (q) => q.eq("userId", user._id))
      .collect();
    for (const usage of myUsages) await ctx.db.delete(usage._id);

    scheduleStorageDeleteByUrl(user.customAvatar ?? null);

    // Remove user document last
    await ctx.db.delete(user._id);

    for (const key of storageKeysToDelete) {
      await ctx.scheduler.runAfter(0, internal.storage.deleteObject, {
        storageKey: key,
      });
    }
    for (const url of publicUrlsToDelete) {
      await ctx.scheduler.runAfter(0, internal.storage.deleteObjectByPublicUrl, {
        publicUrl: url,
      });
    }

    return {
      deleted: true,
      transferredToEmail: defaultRecipientDoc?.email ?? null,
      counters,
    };
  },
});
