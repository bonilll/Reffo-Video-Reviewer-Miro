import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { getCurrentUserOrThrow } from "./utils/auth";
import { api } from "./_generated/api";

const sanitizeMember = (member: any) => ({
  id: member._id,
  email: member.email,
  userId: member.userId ?? null,
  role: member.role,
  status: member.status,
  invitedAt: member.invitedAt,
  acceptedAt: member.acceptedAt ?? null,
});

export const list = query({
  args: {},
  async handler(ctx) {
    const user = await getCurrentUserOrThrow(ctx);

    const groups = await ctx.db
      .query("shareGroups")
      .withIndex("byOwner", (q) => q.eq("ownerId", user._id))
      .collect();

    const memberPromises = groups.map(async (group) => {
      const members = await ctx.db
        .query("shareGroupMembers")
        .withIndex("byGroup", (q) => q.eq("groupId", group._id))
        .collect();
      return {
        id: group._id,
        name: group.name,
        description: group.description ?? null,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
        members: members.map(sanitizeMember),
      };
    });

    return await Promise.all(memberPromises);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
  },
  async handler(ctx, { name, description }) {
    const user = await getCurrentUserOrThrow(ctx);
    const now = Date.now();

    const groupId = await ctx.db.insert("shareGroups", {
      ownerId: user._id,
      name,
      description,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("shareGroupMembers", {
      groupId,
      email: user.email,
      userId: user._id,
      role: "owner",
      status: "active",
      invitedAt: now,
      acceptedAt: now,
    });

    return groupId;
  },
});

export const update = mutation({
  args: {
    groupId: v.id("shareGroups"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  async handler(ctx, { groupId, name, description }) {
    const user = await getCurrentUserOrThrow(ctx);
    const group = await ctx.db.get(groupId);
    if (!group || group.ownerId !== user._id) {
      throw new ConvexError("GROUP_NOT_FOUND");
    }

    await ctx.db.patch(groupId, {
      name: name ?? group.name,
      description: description ?? group.description,
      updatedAt: Date.now(),
    });
  },
});

export const archive = mutation({
  args: {
    groupId: v.id("shareGroups"),
  },
  async handler(ctx, { groupId }) {
    const user = await getCurrentUserOrThrow(ctx);
    const group = await ctx.db.get(groupId);
    if (!group || group.ownerId !== user._id) {
      throw new ConvexError("GROUP_NOT_FOUND");
    }

    const members = await ctx.db
      .query("shareGroupMembers")
      .withIndex("byGroup", (q) => q.eq("groupId", groupId))
      .collect();

    await Promise.all(members.map((member) => ctx.db.delete(member._id)));
    await ctx.db.delete(groupId);
  },
});

export const addMember = mutation({
  args: {
    groupId: v.id("shareGroups"),
    email: v.string(),
    role: v.string(),
  },
  async handler(ctx, { groupId, email, role }) {
    const user = await getCurrentUserOrThrow(ctx);
    const normalizedEmail = email.trim().toLowerCase();

    const group = await ctx.db.get(groupId);
    if (!group || group.ownerId !== user._id) {
      throw new ConvexError("GROUP_NOT_FOUND");
    }

    const existingMember = await ctx.db
      .query("shareGroupMembers")
      .withIndex("byGroup", (q) => q.eq("groupId", groupId))
      .filter((q) => q.eq(q.field("email"), normalizedEmail))
      .first();

    if (existingMember) {
      throw new ConvexError("MEMBER_ALREADY_EXISTS");
    }

    const directUser = await ctx.db
      .query("users")
      .withIndex("byEmail", (q) => q.eq("email", normalizedEmail))
      .unique();

    const now = Date.now();

    await ctx.db.insert("shareGroupMembers", {
      groupId,
      email: normalizedEmail,
      userId: directUser?._id,
      role,
      status: directUser ? "active" : "pending",
      invitedAt: now,
      acceptedAt: directUser ? now : undefined,
    });

    // Auto-add to owner's friends list
    await ctx.runMutation(api.friends.add, { email: normalizedEmail });
  },
});

export const syncFriendsFromGroups = mutation({
  args: {},
  async handler(ctx) {
    const user = await getCurrentUserOrThrow(ctx);
    const groups = await ctx.db.query('shareGroups').withIndex('byOwner', (q) => q.eq('ownerId', user._id)).collect();
    for (const g of groups) {
      const members = await ctx.db.query('shareGroupMembers').withIndex('byGroup', (q) => q.eq('groupId', g._id)).collect();
      for (const m of members) {
        await ctx.runMutation(api.friends.add, { email: m.email });
      }
    }
  },
});

export const updateMember = mutation({
  args: {
    memberId: v.id("shareGroupMembers"),
    role: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  async handler(ctx, { memberId, role, status }) {
    const user = await getCurrentUserOrThrow(ctx);
    const member = await ctx.db.get(memberId);
    if (!member) {
      throw new ConvexError("MEMBER_NOT_FOUND");
    }

    const group = await ctx.db.get(member.groupId);
    if (!group || group.ownerId !== user._id) {
      throw new ConvexError("FORBIDDEN");
    }

    await ctx.db.patch(memberId, {
      role: role ?? member.role,
      status: status ?? member.status,
    });
  },
});

export const removeMember = mutation({
  args: {
    memberId: v.id("shareGroupMembers"),
  },
  async handler(ctx, { memberId }) {
    const user = await getCurrentUserOrThrow(ctx);
    const member = await ctx.db.get(memberId);
    if (!member) {
      throw new ConvexError("MEMBER_NOT_FOUND");
    }
    const group = await ctx.db.get(member.groupId);
    if (!group || group.ownerId !== user._id) {
      throw new ConvexError("FORBIDDEN");
    }

    await ctx.db.delete(memberId);
  },
});
