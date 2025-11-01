import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { getCurrentUserDoc, getCurrentUserOrThrow } from "./utils/auth";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const sanitizeShare = (share: any) => ({
  id: share._id,
  videoId: share.videoId ?? null,
  projectId: share.projectId ?? null,
  groupId: share.groupId ?? null,
  linkToken: share.linkToken ?? null,
  allowDownload: share.allowDownload,
  allowComments: share.allowComments,
  isActive: share.isActive,
  createdAt: share.createdAt,
  expiresAt: share.expiresAt ?? null,
});

export const list = query({
  args: {},
  async handler(ctx) {
    const user = await getCurrentUserOrThrow(ctx);
    const shares = await ctx.db
      .query("contentShares")
      .withIndex("byOwner", (q) => q.eq("ownerId", user._id))
      .collect();

    return shares.map(sanitizeShare);
  },
});

export const shareToGroup = mutation({
  args: {
    videoId: v.optional(v.id("videos")),
    projectId: v.optional(v.id("projects")),
    groupId: v.id("shareGroups"),
    allowDownload: v.boolean(),
    allowComments: v.boolean(),
  },
  async handler(ctx, args) {
    const user = await getCurrentUserOrThrow(ctx);

    if (!args.videoId && !args.projectId) {
      throw new ConvexError("ITEM_REQUIRED");
    }

    const group = await ctx.db.get(args.groupId);
    if (!group || group.ownerId !== user._id) {
      throw new ConvexError("GROUP_NOT_FOUND");
    }

    let queryBuilder = ctx.db
      .query("contentShares")
      .withIndex("byOwner", (q) => q.eq("ownerId", user._id))
      .filter((q) => q.eq(q.field("groupId"), args.groupId));

    if (args.videoId) {
      queryBuilder = queryBuilder.filter((q) => q.eq(q.field("videoId"), args.videoId));
    } else if (args.projectId) {
      queryBuilder = queryBuilder.filter((q) => q.eq(q.field("projectId"), args.projectId));
    }

    const existing = await queryBuilder.first();

    const payload = {
      ownerId: user._id,
      videoId: args.videoId,
      projectId: args.projectId,
      groupId: args.groupId,
      linkToken: existing?.linkToken,
      allowDownload: args.allowDownload,
      allowComments: args.allowComments,
      isActive: true,
      createdAt: existing?.createdAt ?? Date.now(),
      expiresAt: existing?.expiresAt,
    } as const;

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      // If sharing a project, propagate settings to all existing videos in the project
      if (args.projectId) {
        const videos = await ctx.db
          .query('videos')
          .withIndex('byProject', (q) => q.eq('projectId', args.projectId!))
          .collect();
        for (const v of videos) {
          const existingVideoShare = await ctx.db
            .query('contentShares')
            .withIndex('byVideo', (q) => q.eq('videoId', v._id))
            .filter((q) => q.eq(q.field('groupId'), args.groupId))
            .first();
          if (existingVideoShare) {
            await ctx.db.patch(existingVideoShare._id, {
              allowDownload: args.allowDownload,
              allowComments: args.allowComments,
              isActive: true,
            });
          } else {
            await ctx.db.insert('contentShares', {
              ownerId: user._id,
              videoId: v._id,
              projectId: args.projectId,
              groupId: args.groupId,
              linkToken: undefined,
              allowDownload: args.allowDownload,
              allowComments: args.allowComments,
              isActive: true,
              createdAt: Date.now(),
              expiresAt: existing?.expiresAt,
            });
          }
        }
      }
      // Notify members
      const members = await ctx.db.query('shareGroupMembers').withIndex('byGroup', (q) => q.eq('groupId', args.groupId)).collect();
      await Promise.all(members.map(async (m) => {
        const u = await ctx.db.query('users').withIndex('byEmail', (q) => q.eq('email', m.email)).unique();
        if (u) {
          await ctx.db.insert('notifications', {
            userId: u._id,
            type: 'share',
            message: args.videoId ? 'A review was shared with your group' : 'A project was shared with your group',
            videoId: args.videoId,
            projectId: args.projectId,
            fromUserId: user._id,
            createdAt: Date.now(),
            readAt: undefined,
          });
          // auto-add friends relation
          await ctx.runMutation(api.friends.add, { email: u.email });
        }
      }));
      return existing._id;
    }

    const id = await ctx.db.insert("contentShares", payload);
    // If sharing a project, propagate to all current videos
    if (args.projectId) {
      const videos = await ctx.db
        .query('videos')
        .withIndex('byProject', (q) => q.eq('projectId', args.projectId!))
        .collect();
      for (const v of videos) {
        const existingVideoShare = await ctx.db
          .query('contentShares')
          .withIndex('byVideo', (q) => q.eq('videoId', v._id))
          .filter((q) => q.eq(q.field('groupId'), args.groupId))
          .first();
        if (!existingVideoShare) {
          await ctx.db.insert('contentShares', {
            ownerId: user._id,
            videoId: v._id,
            projectId: args.projectId,
            groupId: args.groupId,
            linkToken: undefined,
            allowDownload: args.allowDownload,
            allowComments: args.allowComments,
            isActive: true,
            createdAt: Date.now(),
            expiresAt: undefined,
          });
        } else {
          await ctx.db.patch(existingVideoShare._id, {
            allowDownload: args.allowDownload,
            allowComments: args.allowComments,
            isActive: true,
          });
        }
      }
    }
    const members = await ctx.db.query('shareGroupMembers').withIndex('byGroup', (q) => q.eq('groupId', args.groupId)).collect();
    await Promise.all(members.map(async (m) => {
      const u = await ctx.db.query('users').withIndex('byEmail', (q) => q.eq('email', m.email)).unique();
      if (u) {
        await ctx.db.insert('notifications', {
          userId: u._id,
          type: 'share',
          message: args.videoId ? 'A review was shared with your group' : 'A project was shared with your group',
          videoId: args.videoId,
          projectId: args.projectId,
          fromUserId: user._id,
          createdAt: Date.now(),
          readAt: undefined,
        });
        await ctx.runMutation(api.friends.add, { email: u.email });
      }
    }));
    return id;
  },
});

export const generateLink = mutation({
  args: {
    videoId: v.optional(v.id("videos")),
    projectId: v.optional(v.id("projects")),
    allowDownload: v.boolean(),
    allowComments: v.boolean(),
    expiresAt: v.optional(v.number()),
  },
  async handler(ctx, args) {
    const user = await getCurrentUserOrThrow(ctx);
    if (!args.videoId && !args.projectId) {
      throw new ConvexError("ITEM_REQUIRED");
    }

    const now = Date.now();
    // First insert without a token, then use the generated document id as the stable token.
    const shareId = await ctx.db.insert("contentShares", {
      ownerId: user._id,
      videoId: args.videoId,
      projectId: args.projectId,
      groupId: undefined,
      linkToken: undefined,
      allowDownload: args.allowDownload,
      allowComments: args.allowComments,
      isActive: true,
      createdAt: now,
      expiresAt: args.expiresAt,
    });

    const token = shareId as unknown as string;
    await ctx.db.patch(shareId, { linkToken: token });
    return token;
  },
});

export const revoke = mutation({
  args: {
    shareId: v.id("contentShares"),
  },
  async handler(ctx, { shareId }) {
    const user = await getCurrentUserOrThrow(ctx);
    const share = await ctx.db.get(shareId);
    if (!share || share.ownerId !== user._id) {
      throw new ConvexError("SHARE_NOT_FOUND");
    }
    await ctx.db.patch(shareId, { isActive: false });
  },
});

export const resolveToken = query({
  args: {
    token: v.optional(v.string()),
  },
  async handler(ctx, { token }) {
    if (!token) return null;
    const share = await ctx.db
      .query("contentShares")
      .withIndex("byLinkToken", (q) => q.eq("linkToken", token))
      .unique();
    if (!share || !share.isActive) {
      return null;
    }
    if (share.expiresAt && share.expiresAt < Date.now()) {
      return null;
    }

    return sanitizeShare(share);
  },
});

export const videosSharedWithMe = query({
  args: {},
  async handler(ctx) {
    const user = await getCurrentUserDoc(ctx);
    if (!user) return [] as any[];
    const memberships = await ctx.db
      .query('shareGroupMembers')
      .withIndex('byEmail', (q) => q.eq('email', user.email))
      .collect();
    if (!memberships.length) return [] as any[];
    const groupIds = new Set(memberships.map((m) => m.groupId));
    const shares = await ctx.db.query('contentShares').collect();
    const eligible = shares.filter(s => s.isActive && s.groupId && groupIds.has(s.groupId as Id<'shareGroups'>) && s.videoId);
    const uniqueVideoIds = Array.from(new Set(eligible.map(s => s.videoId as Id<'videos'>)));
    const videos = await Promise.all(uniqueVideoIds.map(id => ctx.db.get(id)));
    return videos.filter(Boolean).map((video: any) => ({
      id: video._id,
      title: video.title,
      description: video.description ?? null,
      src: video.src,
      storageKey: video.storageKey,
      width: video.width,
      height: video.height,
      fps: video.fps,
      duration: video.duration,
      projectId: video.projectId ?? null,
      uploadedAt: video.uploadedAt,
      lastReviewedAt: video.lastReviewedAt ?? null,
      thumbnailUrl: video.thumbnailUrl ?? null,
    }));
  },
});

export const projectsSharedWithMe = query({
  args: {},
  async handler(ctx) {
    const user = await getCurrentUserDoc(ctx);
    if (!user) return [] as any[];
    const memberships = await ctx.db
      .query('shareGroupMembers')
      .withIndex('byEmail', (q) => q.eq('email', user.email))
      .collect();
    if (!memberships.length) return [] as any[];
    const groupIds = new Set(memberships.map((m) => m.groupId));
    const shares = await ctx.db.query('contentShares').collect();
    const eligible = shares.filter(s => s.isActive && s.groupId && groupIds.has(s.groupId as Id<'shareGroups'>) && s.projectId);
    const uniqueProjectIds = Array.from(new Set(eligible.map(s => s.projectId as Id<'projects'>)));
    const projects = await Promise.all(uniqueProjectIds.map(id => ctx.db.get(id)));
    return projects.filter(Boolean).map((p: any) => ({ _id: p._id, name: p.name, createdAt: p.createdAt, updatedAt: p.updatedAt }));
  },
});

export const autoShareVideo = mutation({
  args: {
    videoId: v.id("videos"),
    projectId: v.optional(v.id("projects")),
  },
  async handler(ctx, { videoId, projectId }) {
    if (!projectId) return;
    const video = await ctx.db.get(videoId);
    if (!video) return;
    const shares = await ctx.db
      .query("contentShares")
      .withIndex("byProject", (q) => q.eq("projectId", projectId))
      .collect();

    const now = Date.now();

    await Promise.all(
      shares
        .filter((share) => share.isActive)
        .map((share) =>
          ctx.db.insert("contentShares", {
            ownerId: share.ownerId,
            videoId,
            projectId,
            groupId: share.groupId,
            linkToken: share.linkToken,
            allowDownload: share.allowDownload,
            allowComments: share.allowComments,
            isActive: share.isActive,
            createdAt: now,
            expiresAt: share.expiresAt,
          })
        )
    );
  },
});

export const getShareContext = query({
  args: {
    videoId: v.id("videos"),
  },
  async handler(ctx, { videoId }) {
    const video = await ctx.db.get(videoId);
    if (!video) {
      return { shares: [] };
    }
    const shares = await ctx.db
      .query("contentShares")
      .withIndex("byVideo", (q) => q.eq("videoId", videoId))
      .collect();
    return {
      shares: shares.map(sanitizeShare),
    };
  },
});
