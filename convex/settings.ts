import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUserDoc, getCurrentUserOrThrow } from "./utils/auth";

const defaultSettings = () => ({
  notifications: {
    reviewUpdates: true,
    commentMentions: true,
    weeklyDigest: true,
    productUpdates: false,
  },
  // backupEmail is optional; omit when not set
  security: {
    twoFactorEnabled: false,
    loginAlerts: true,
  },
  // defaultProjectId is optional; omit when not set
  workspace: {
    autoShareGroupIds: [] as any[],
    theme: 'system',
  },
  // integrations keys are optional; start empty
  integrations: {},
  billing: {
    plan: 'Pro Trial',
    seats: 10,
    renewalDate: Date.now(),
  },
});

export const getOrNull = query({
  args: {},
  async handler(ctx) {
    const user = await getCurrentUserDoc(ctx);
    if (!user) return null;
    const settings = await ctx.db
      .query('userSettings')
      .withIndex('byUser', (q) => q.eq('userId', user._id))
      .unique();
    return settings;
  },
});

export const ensure = mutation({
  args: {},
  async handler(ctx) {
    const user = await getCurrentUserOrThrow(ctx);
    const existing = await ctx.db
      .query('userSettings')
      .withIndex('byUser', (q) => q.eq('userId', user._id))
      .unique();
    if (existing) return existing._id;
    const now = Date.now();
    const defaults = defaultSettings();
    const payload: any = {
      userId: user._id,
      notifications: defaults.notifications,
      security: defaults.security,
      workspace: defaults.workspace,
      integrations: defaults.integrations,
      billing: defaults.billing,
      createdAt: now,
      updatedAt: now,
    };
    const settingsId = await ctx.db.insert('userSettings', payload);
    return settingsId;
  },
});

export const update = mutation({
  args: {
    notifications: v.optional(
      v.object({
        reviewUpdates: v.boolean(),
        commentMentions: v.boolean(),
        weeklyDigest: v.boolean(),
        productUpdates: v.boolean(),
      })
    ),
    security: v.optional(
      v.object({
        twoFactorEnabled: v.boolean(),
        loginAlerts: v.boolean(),
        backupEmail: v.optional(v.string()),
      })
    ),
    workspace: v.optional(
      v.object({
        defaultProjectId: v.optional(v.id('projects')),
        autoShareGroupIds: v.array(v.id('shareGroups')),
        theme: v.string(),
      })
    ),
    integrations: v.optional(
      v.object({
        slackWebhook: v.optional(v.string()),
        notionWorkspaceUrl: v.optional(v.string()),
        frameIoAccount: v.optional(v.string()),
      })
    ),
    billing: v.optional(
      v.object({
        plan: v.string(),
        seats: v.number(),
        renewalDate: v.number(),
      })
    ),
  },
  async handler(ctx, args) {
    const user = await getCurrentUserOrThrow(ctx);
    let current = await ctx.db
      .query('userSettings')
      .withIndex('byUser', (q) => q.eq('userId', user._id))
      .unique();
    if (!current) {
      const now = Date.now();
      const defaults = defaultSettings();
      const id = await ctx.db.insert('userSettings', {
        userId: user._id,
        notifications: defaults.notifications,
        security: defaults.security,
        workspace: defaults.workspace,
        integrations: defaults.integrations,
        billing: defaults.billing,
        createdAt: now,
        updatedAt: now,
      } as any);
      const fetched = await ctx.db.get(id);
      if (!fetched) {
        throw new Error('SETTINGS_CREATE_FAILED');
      }
      current = fetched;
    }

    await ctx.db.patch(current._id, {
      notifications: args.notifications ?? current.notifications,
      security: args.security
        ? {
            ...current.security,
            ...args.security,
        }
        : current.security,
      workspace: args.workspace
        ? {
            ...current.workspace,
            ...args.workspace,
        }
        : current.workspace,
      integrations: args.integrations
        ? {
            ...current.integrations,
            ...args.integrations,
        }
        : current.integrations,
      billing: args.billing ?? current.billing,
      updatedAt: Date.now(),
    });
  },
});
