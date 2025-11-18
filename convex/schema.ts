import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const pointValidator = v.object({
  x: v.number(),
  y: v.number(),
});

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    avatar: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("byClerkId", ["clerkId"])
    .index("byEmail", ["email"]),

  projects: defineTable({
    name: v.string(),
    ownerId: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("byOwner", ["ownerId"])
    .searchIndex("search_name", {
      searchField: "name",
    }),

  videos: defineTable({
    projectId: v.optional(v.id("projects")),
    ownerId: v.id("users"),
    title: v.string(),
    description: v.optional(v.string()),
    storageKey: v.string(),
    src: v.string(),
    width: v.number(),
    height: v.number(),
    fps: v.number(),
    duration: v.number(),
    uploadedAt: v.number(),
    lastReviewedAt: v.optional(v.number()),
    thumbnailUrl: v.optional(v.string()),
  })
    .index("byOwner", ["ownerId"])
    .index("byProject", ["projectId"])
    .index("byOwnerAndProject", ["ownerId", "projectId"]),

  annotations: defineTable({
    videoId: v.id("videos"),
    authorId: v.id("users"),
    frame: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    data: v.any(),
  })
    .index("byVideo", ["videoId"])
    .index("byVideoAndFrame", ["videoId", "frame"]),

  comments: defineTable({
    videoId: v.id("videos"),
    authorId: v.id("users"),
    text: v.string(),
    frame: v.optional(v.number()),
    resolved: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
    parentId: v.optional(v.id("comments")),
    position: v.optional(pointValidator),
  })
    .index("byVideo", ["videoId"])
    .index("byParent", ["parentId"])
    .index("byVideoAndFrame", ["videoId", "frame"]),

  shareGroups: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    description: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("byOwner", ["ownerId"]),

  shareGroupMembers: defineTable({
    groupId: v.id("shareGroups"),
    email: v.string(),
    userId: v.optional(v.id("users")),
    role: v.string(),
    status: v.string(),
    invitedAt: v.number(),
    acceptedAt: v.optional(v.number()),
  })
    .index("byGroup", ["groupId"])
    .index("byEmail", ["email"]),

  contentShares: defineTable({
    ownerId: v.id("users"),
    videoId: v.optional(v.id("videos")),
    projectId: v.optional(v.id("projects")),
    groupId: v.optional(v.id("shareGroups")),
    linkToken: v.optional(v.string()),
    allowDownload: v.boolean(),
    allowComments: v.boolean(),
    isActive: v.boolean(),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
  })
    .index("byOwner", ["ownerId"]) 
    .index("byLinkToken", ["linkToken"]) 
    .index("byVideo", ["videoId"]) 
    .index("byProject", ["projectId"]),

  friends: defineTable({
    ownerId: v.id("users"),
    contactUserId: v.optional(v.id("users")),
    contactEmail: v.string(),
    contactName: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("byOwner", ["ownerId"]) 
    .index("byEmail", ["contactEmail"]),

  notifications: defineTable({
    userId: v.id("users"),
    type: v.string(), // 'share' | 'mention'
    message: v.string(),
    videoId: v.optional(v.id("videos")),
    projectId: v.optional(v.id("projects")),
    commentId: v.optional(v.id("comments")),
    frame: v.optional(v.number()),
    mentionText: v.optional(v.string()),
    fromUserId: v.optional(v.id("users")),
    contextTitle: v.optional(v.string()),
    previewUrl: v.optional(v.string()),
    shareToken: v.optional(v.string()),
    createdAt: v.number(),
    readAt: v.optional(v.number()),
  })
    .index("byUser", ["userId"]) 
    .index("byUserAndCreatedAt", ["userId", "createdAt"]),

  userSettings: defineTable({
    userId: v.id("users"),
    notifications: v.object({
      reviewUpdates: v.boolean(),
      commentMentions: v.boolean(),
      weeklyDigest: v.boolean(),
      productUpdates: v.boolean(),
    }),
    security: v.object({
      twoFactorEnabled: v.boolean(),
      loginAlerts: v.boolean(),
      backupEmail: v.optional(v.string()),
    }),
    workspace: v.object({
      defaultProjectId: v.optional(v.id("projects")),
      autoShareGroupIds: v.array(v.id("shareGroups")),
      theme: v.string(),
    }),
    integrations: v.object({
      slackWebhook: v.optional(v.string()),
      notionWorkspaceUrl: v.optional(v.string()),
      frameIoAccount: v.optional(v.string()),
    }),
    billing: v.object({
      plan: v.string(),
      seats: v.number(),
      renewalDate: v.number(),
    }),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("byUser", ["userId"]),

  // Per-user Slack OAuth connections (multi-workspace) to send DMs for mentions
  slackConnections: defineTable({
    userId: v.id("users"),
    teamId: v.string(),
    teamName: v.string(),
    botUserId: v.string(),
    slackUserId: v.string(),
    accessToken: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("byUser", ["userId"]) 
    .index("byUserAndTeam", ["userId", "teamId"]),

  // Ephemeral OAuth state to validate Slack (and other providers) callbacks
  oauthStates: defineTable({
    provider: v.string(), // e.g. 'slack'
    nonce: v.string(),
    userId: v.id("users"),
    createdAt: v.number(),
  })
    .index("byProviderAndNonce", ["provider", "nonce"]),

  cookieConsents: defineTable({
    userId: v.optional(v.id("users")),
    visitorId: v.string(),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    locale: v.optional(v.string()),
    consentGiven: v.boolean(),
    categories: v.object({
      necessary: v.boolean(),
      preferences: v.boolean(),
      analytics: v.boolean(),
      marketing: v.boolean(),
    }),
    consentVersion: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("byVisitor", ["visitorId"])
    .index("byUser", ["userId"]),

  legalAcceptances: defineTable({
    userId: v.optional(v.id("users")),
    visitorId: v.optional(v.string()),
    documentType: v.string(),
    documentVersion: v.string(),
    acceptedAt: v.number(),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  })
    .index("byUserAndDoc", ["userId", "documentType"])
    .index("byVisitorAndDoc", ["visitorId", "documentType"]),

  compositions: defineTable({
    ownerId: v.id("users"),
    projectId: v.optional(v.id("projects")),
    sourceVideoId: v.optional(v.id("videos")),
    title: v.string(),
    description: v.optional(v.string()),
    settings: v.object({
      width: v.number(),
      height: v.number(),
      fps: v.number(),
      durationFrames: v.number(),
      backgroundColor: v.optional(v.string()),
    }),
    version: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("byOwner", ["ownerId"])
    .index("byProject", ["projectId"])
    .index("bySourceVideo", ["sourceVideoId"]),

  compositionClips: defineTable({
    compositionId: v.id("compositions"),
    sourceVideoId: v.id("videos"),
    sourceInFrame: v.number(),
    sourceOutFrame: v.number(),
    timelineStartFrame: v.number(),
    speed: v.number(),
    opacity: v.optional(v.number()),
    transformTrackId: v.optional(v.id("keyframeTracks")),
    zIndex: v.number(),
    label: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("byComposition", ["compositionId"])
    .index("byCompositionAndZ", ["compositionId", "zIndex"]),

  keyframeTracks: defineTable({
    compositionId: v.id("compositions"),
    clipId: v.optional(v.id("compositionClips")),
    channel: v.string(),
    keyframes: v.array(
      v.object({
        frame: v.number(),
        value: v.any(),
        interpolation: v.optional(v.string()),
        easing: v.optional(v.string()),
      })
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("byComposition", ["compositionId"])
    .index("byClip", ["clipId"]),

  compositionExports: defineTable({
    compositionId: v.id("compositions"),
    ownerId: v.id("users"),
    status: v.string(),
    format: v.string(),
    renderJobId: v.optional(v.id("renderJobs")),
    outputStorageKey: v.optional(v.string()),
    outputPublicUrl: v.optional(v.string()),
    progress: v.number(),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("byComposition", ["compositionId"])
    .index("byOwner", ["ownerId"]),

  renderJobs: defineTable({
    jobType: v.string(),
    compositionId: v.optional(v.id("compositions")),
    payload: v.any(),
    status: v.string(),
    progress: v.number(),
    error: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("byStatus", ["status"])
    .index("byType", ["jobType"]),
});
