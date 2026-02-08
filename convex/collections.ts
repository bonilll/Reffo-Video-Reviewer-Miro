import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserDoc, getCurrentUserOrThrow } from "./utils/auth";

type CollectionRole = "owner" | "editor" | "viewer";

const normalizeCollectionTitleDisplay = (title: string) => {
  const cleaned = title.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

const normalizeCollectionTitleKey = (title: string) =>
  title.replace(/\s+/g, " ").trim().toLowerCase();

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const roleRank: Record<CollectionRole, number> = { owner: 3, editor: 2, viewer: 1 };

async function getCollectionAccess(
  ctx: any,
  collectionId: Id<"assetCollections">,
  user: { _id: Id<"users">; email?: string | null },
): Promise<{ canRead: boolean; canWrite: boolean; role: CollectionRole | null; collection: Doc<"assetCollections"> | null }> {
  const collection = (await ctx.db.get(collectionId)) as Doc<"assetCollections"> | null;
  if (!collection) {
    return { canRead: false, canWrite: false, role: null, collection: null };
  }

  if (collection.ownerId === user._id) {
    return { canRead: true, canWrite: true, role: "owner", collection };
  }

  const normalizedEmail = user.email ? normalizeEmail(user.email) : null;
  let bestRole: CollectionRole | null = null;

  const byUser = await ctx.db
    .query("assetCollectionSharing")
    .withIndex("byCollectionUser", (q: any) => q.eq("collectionId", collectionId).eq("userId", user._id))
    .first();
  if (byUser?.role === "editor" || byUser?.role === "viewer") {
    bestRole = byUser.role as CollectionRole;
  }

  if (normalizedEmail) {
    const byEmail = await ctx.db
      .query("assetCollectionSharing")
      .withIndex("byCollectionEmail", (q: any) => q.eq("collectionId", collectionId).eq("userEmail", normalizedEmail))
      .first();
    if (byEmail?.role === "editor" || byEmail?.role === "viewer") {
      const nextRole = byEmail.role as CollectionRole;
      if (!bestRole || roleRank[nextRole] > roleRank[bestRole]) bestRole = nextRole;
    }

    // Group-based shares: user is eligible if their email is an active member of the share group.
    const memberships = await ctx.db
      .query("shareGroupMembers")
      .withIndex("byEmail", (q: any) => q.eq("email", normalizedEmail))
      .collect();
    const groupIds = memberships.map((m: any) => m.groupId);

    if (groupIds.length > 0) {
      const groupShares = await Promise.all(
        groupIds.map(async (groupId: Id<"shareGroups">) => {
          return await ctx.db
            .query("assetCollectionSharing")
            .withIndex("byCollectionGroup", (q: any) => q.eq("collectionId", collectionId).eq("groupId", groupId))
            .first();
        }),
      );
      for (const s of groupShares.filter(Boolean)) {
        const r = (s.role as CollectionRole) ?? "viewer";
        if (!bestRole || roleRank[r] > roleRank[bestRole]) bestRole = r;
      }
    }
  }

  if (!bestRole) {
    return { canRead: false, canWrite: false, role: null, collection };
  }

  return {
    canRead: true,
    canWrite: bestRole === "editor",
    role: bestRole,
    collection,
  };
}

const sanitizeCollection = (collection: Doc<"assetCollections">, extra?: any) => ({
  id: collection._id,
  title: collection.title,
  projectId: collection.projectId ?? null,
  coverUrl: collection.coverUrl ?? null,
  createdAt: collection.createdAt,
  updatedAt: collection.updatedAt,
  ...extra,
});

async function getCollectionStats(ctx: any, collectionId: Id<"assetCollections">) {
  const items = (await ctx.db
    .query("assetCollectionItems")
    .withIndex("byCollection", (q: any) => q.eq("collectionId", collectionId))
    .collect()) as Doc<"assetCollectionItems">[];

  const itemCount = items.length;
  const sampleItems = items.slice(0, 8);
  const sampleAssets = await Promise.all(sampleItems.map((it) => ctx.db.get(it.assetId)));
  const sampleUrls = sampleAssets
    .filter(Boolean)
    .map((a: any) => a.fileUrl)
    .filter((u: any) => typeof u === "string" && u);

  return { itemCount, sampleUrls };
}

export const create = mutation({
  args: {
    title: v.string(),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const title = normalizeCollectionTitleDisplay(args.title);
    if (!title) throw new ConvexError("TITLE_REQUIRED");
    if (title.length > 80) throw new ConvexError("TITLE_TOO_LONG");

    // Avoid duplicates for the same owner regardless of casing/spacing.
    const titleKey = normalizeCollectionTitleKey(title);
    const ownedExisting = (await ctx.db
      .query("assetCollections")
      .withIndex("byOwnerUpdatedAt", (q: any) => q.eq("ownerId", user._id))
      .collect()) as Doc<"assetCollections">[];
    const existing = ownedExisting.find((c) => normalizeCollectionTitleKey(c.title) === titleKey);
    if (existing) return existing._id;

    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (!project) throw new ConvexError("PROJECT_NOT_FOUND");
      if (project.ownerId !== user._id) throw new ConvexError("FORBIDDEN");
    }

    const now = Date.now();
    const id = await ctx.db.insert("assetCollections", {
      ownerId: user._id,
      title,
      projectId: args.projectId,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserDoc(ctx);
    if (!user) return [];

    const normalizedEmail = user.email ? normalizeEmail(user.email) : null;
    const owned = (await ctx.db
      .query("assetCollections")
      .withIndex("byOwnerUpdatedAt", (q: any) => q.eq("ownerId", user._id))
      .order("desc")
      .collect()) as Doc<"assetCollections">[];

    const sharedByUser = (await ctx.db
      .query("assetCollectionSharing")
      .withIndex("byUser", (q: any) => q.eq("userId", user._id))
      .collect()) as Doc<"assetCollectionSharing">[];

    const sharedByEmail = normalizedEmail
      ? ((await ctx.db
          .query("assetCollectionSharing")
          .withIndex("byEmail", (q: any) => q.eq("userEmail", normalizedEmail))
          .collect()) as Doc<"assetCollectionSharing">[])
      : [];

    const memberships = normalizedEmail
      ? ((await ctx.db
          .query("shareGroupMembers")
          .withIndex("byEmail", (q: any) => q.eq("email", normalizedEmail))
          .collect()) as Doc<"shareGroupMembers">[])
      : [];
    const groupIds = memberships.map((m) => m.groupId);
    const sharedByGroup = await Promise.all(
      groupIds.map(async (groupId) => {
        const records = (await ctx.db
          .query("assetCollectionSharing")
          .withIndex("byGroup", (q: any) => q.eq("groupId", groupId))
          .collect()) as Doc<"assetCollectionSharing">[];
        return records;
      }),
    );

    const sharedRecords = [...sharedByUser, ...sharedByEmail, ...sharedByGroup.flat()];
    const sharedIds = [...new Set(sharedRecords.map((r) => r.collectionId))];

    const sharedCollections = await Promise.all(
      sharedIds.map(async (id: Id<"assetCollections">) => {
        const collection = (await ctx.db.get(id)) as Doc<"assetCollections"> | null;
        if (!collection) return null;
        if (collection.ownerId === user._id) return null;

        // pick the highest role across potential shares
        const records = sharedRecords.filter((r) => r.collectionId === id);
        let best: CollectionRole = "viewer";
        for (const r of records) {
          const role = (r.role as CollectionRole) ?? "viewer";
          if (roleRank[role] > roleRank[best]) best = role;
        }

        const stats = await getCollectionStats(ctx, id);
        return sanitizeCollection(collection, {
          isShared: true,
          sharedRole: best,
          ...stats,
        });
      }),
    );

    const ownedWithStats = await Promise.all(
      owned.map(async (c) => {
        const stats = await getCollectionStats(ctx, c._id);
        return sanitizeCollection(c, { isShared: false, sharedRole: null, ...stats });
      }),
    );

    return [...ownedWithStats, ...sharedCollections.filter(Boolean)];
  },
});

export const updateTitle = mutation({
  args: {
    id: v.id("assetCollections"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const col = await ctx.db.get(args.id);
    if (!col) throw new ConvexError("COLLECTION_NOT_FOUND");
    if (col.ownerId !== user._id) throw new ConvexError("FORBIDDEN");
    const title = normalizeCollectionTitleDisplay(args.title);
    if (!title) throw new ConvexError("TITLE_REQUIRED");
    if (title.length > 80) throw new ConvexError("TITLE_TOO_LONG");

    const titleKey = normalizeCollectionTitleKey(title);
    const ownedExisting = (await ctx.db
      .query("assetCollections")
      .withIndex("byOwnerUpdatedAt", (q: any) => q.eq("ownerId", user._id))
      .collect()) as Doc<"assetCollections">[];
    const dupe = ownedExisting.find(
      (c) => c._id !== args.id && normalizeCollectionTitleKey(c.title) === titleKey,
    );
    if (dupe) throw new ConvexError("TITLE_ALREADY_EXISTS");

    await ctx.db.patch(args.id, { title, updatedAt: Date.now() });
    return args.id;
  },
});

export const setProject = mutation({
  args: {
    id: v.id("assetCollections"),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const col = await ctx.db.get(args.id);
    if (!col) throw new ConvexError("COLLECTION_NOT_FOUND");
    if (col.ownerId !== user._id) throw new ConvexError("FORBIDDEN");

    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (!project) throw new ConvexError("PROJECT_NOT_FOUND");
      if (project.ownerId !== user._id) throw new ConvexError("FORBIDDEN");
    }

    await ctx.db.patch(args.id, { projectId: args.projectId, updatedAt: Date.now() });
    return args.id;
  },
});

export const setCover = mutation({
  args: {
    id: v.id("assetCollections"),
    coverUrl: v.string(),
    coverStorageKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const col = await ctx.db.get(args.id);
    if (!col) throw new ConvexError("COLLECTION_NOT_FOUND");
    if (col.ownerId !== user._id) throw new ConvexError("FORBIDDEN");
    await ctx.db.patch(args.id, {
      coverUrl: args.coverUrl,
      coverStorageKey: args.coverStorageKey,
      updatedAt: Date.now(),
    });
    return args.id;
  },
});

export const clearCover = mutation({
  args: {
    id: v.id("assetCollections"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const col = await ctx.db.get(args.id);
    if (!col) throw new ConvexError("COLLECTION_NOT_FOUND");
    if (col.ownerId !== user._id) throw new ConvexError("FORBIDDEN");
    await ctx.db.patch(args.id, {
      coverUrl: undefined,
      coverStorageKey: undefined,
      updatedAt: Date.now(),
    });
    return args.id;
  },
});

export const remove = mutation({
  args: {
    id: v.id("assetCollections"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const col = await ctx.db.get(args.id);
    if (!col) throw new ConvexError("COLLECTION_NOT_FOUND");
    if (col.ownerId !== user._id) throw new ConvexError("FORBIDDEN");

    const items = (await ctx.db
      .query("assetCollectionItems")
      .withIndex("byCollection", (q: any) => q.eq("collectionId", args.id))
      .collect()) as Doc<"assetCollectionItems">[];
    const shares = (await ctx.db
      .query("assetCollectionSharing")
      .withIndex("byCollection", (q: any) => q.eq("collectionId", args.id))
      .collect()) as Doc<"assetCollectionSharing">[];

    await Promise.all([...items.map((i) => ctx.db.delete(i._id)), ...shares.map((s) => ctx.db.delete(s._id))]);
    await ctx.db.delete(args.id);
    return args.id;
  },
});

export const addAssets = mutation({
  args: {
    collectionId: v.id("assetCollections"),
    assetIds: v.array(v.id("assets")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const access = await getCollectionAccess(ctx, args.collectionId, {
      _id: user._id,
      email: user.email ?? null,
    });
    if (!access.collection) throw new ConvexError("COLLECTION_NOT_FOUND");
    if (!access.canWrite) throw new ConvexError("FORBIDDEN");

    const unique = Array.from(new Set(args.assetIds));
    if (unique.length === 0) return { added: 0 };

    let added = 0;
    for (const assetId of unique) {
      const asset = await ctx.db.get(assetId);
      if (!asset || asset.userId !== user._id) continue;
      const existing = await ctx.db
        .query("assetCollectionItems")
        .withIndex("byCollectionAsset", (q: any) => q.eq("collectionId", args.collectionId).eq("assetId", assetId))
        .first();
      if (existing) continue;
      await ctx.db.insert("assetCollectionItems", {
        collectionId: args.collectionId,
        assetId,
        addedBy: user._id,
        addedAt: Date.now(),
      });
      added += 1;
    }

    await ctx.db.patch(args.collectionId, { updatedAt: Date.now() });
    return { added };
  },
});

export const removeAssets = mutation({
  args: {
    collectionId: v.id("assetCollections"),
    assetIds: v.array(v.id("assets")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const access = await getCollectionAccess(ctx, args.collectionId, {
      _id: user._id,
      email: user.email ?? null,
    });
    if (!access.collection) throw new ConvexError("COLLECTION_NOT_FOUND");
    if (!access.canWrite) throw new ConvexError("FORBIDDEN");

    const unique = Array.from(new Set(args.assetIds));
    if (unique.length === 0) return { removed: 0 };

    let removed = 0;
    for (const assetId of unique) {
      const item = await ctx.db
        .query("assetCollectionItems")
        .withIndex("byCollectionAsset", (q: any) => q.eq("collectionId", args.collectionId).eq("assetId", assetId))
        .first();
      if (!item) continue;
      await ctx.db.delete(item._id);
      removed += 1;
    }

    await ctx.db.patch(args.collectionId, { updatedAt: Date.now() });
    return { removed };
  },
});

export const listAssets = query({
  args: {
    collectionId: v.id("assetCollections"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserDoc(ctx);
    if (!user) return [];

    const access = await getCollectionAccess(ctx, args.collectionId, user);
    if (!access.collection || !access.canRead) {
      return [];
    }

    const items = (await ctx.db
      .query("assetCollectionItems")
      .withIndex("byCollection", (q: any) => q.eq("collectionId", args.collectionId))
      .order("desc")
      .collect()) as Doc<"assetCollectionItems">[];

    const assets = await Promise.all(items.map((it) => ctx.db.get(it.assetId)));
    return assets.filter(Boolean);
  },
});

export const shareToEmail = mutation({
  args: {
    id: v.id("assetCollections"),
    email: v.string(),
    role: v.union(v.literal("viewer"), v.literal("editor")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const col = await ctx.db.get(args.id);
    if (!col) throw new ConvexError("COLLECTION_NOT_FOUND");
    if (col.ownerId !== user._id) throw new ConvexError("FORBIDDEN");

    const email = normalizeEmail(args.email);
    if (!email) throw new ConvexError("EMAIL_REQUIRED");

    // Multiple user docs may exist in dev; pick the best match.
    const users = await ctx.db.query("users").withIndex("byEmail", (q: any) => q.eq("email", email)).collect();
    const invited = users.sort((a: any, b: any) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0] ?? null;

    const existing = await ctx.db
      .query("assetCollectionSharing")
      .withIndex("byCollectionEmail", (q: any) => q.eq("collectionId", args.id).eq("userEmail", email))
      .first();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        role: args.role,
        userId: invited?._id ?? existing.userId,
        userEmail: email,
        acceptedAt: invited ? now : existing.acceptedAt,
      });
      return existing._id;
    }

    const shareId = await ctx.db.insert("assetCollectionSharing", {
      collectionId: args.id,
      userId: invited?._id,
      userEmail: email,
      groupId: undefined,
      role: args.role,
      invitedBy: user._id,
      createdAt: now,
      acceptedAt: invited ? now : undefined,
    });

    return shareId;
  },
});

export const shareToGroup = mutation({
  args: {
    id: v.id("assetCollections"),
    groupId: v.id("shareGroups"),
    role: v.union(v.literal("viewer"), v.literal("editor")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const col = await ctx.db.get(args.id);
    if (!col) throw new ConvexError("COLLECTION_NOT_FOUND");
    if (col.ownerId !== user._id) throw new ConvexError("FORBIDDEN");

    const group = await ctx.db.get(args.groupId);
    if (!group || group.ownerId !== user._id) throw new ConvexError("GROUP_NOT_FOUND");

    const existing = await ctx.db
      .query("assetCollectionSharing")
      .withIndex("byCollectionGroup", (q: any) => q.eq("collectionId", args.id).eq("groupId", args.groupId))
      .first();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { role: args.role });
      return existing._id;
    }

    const shareId = await ctx.db.insert("assetCollectionSharing", {
      collectionId: args.id,
      userId: undefined,
      userEmail: undefined,
      groupId: args.groupId,
      role: args.role,
      invitedBy: user._id,
      createdAt: now,
      acceptedAt: now,
    });

    return shareId;
  },
});

export const revokeShare = mutation({
  args: {
    shareId: v.id("assetCollectionSharing"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const share = await ctx.db.get(args.shareId);
    if (!share) throw new ConvexError("SHARE_NOT_FOUND");
    const col = await ctx.db.get(share.collectionId);
    if (!col || col.ownerId !== user._id) throw new ConvexError("FORBIDDEN");
    await ctx.db.delete(args.shareId);
    return args.shareId;
  },
});
