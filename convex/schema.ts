import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const pointValidator = v.object({
  x: v.number(),
  y: v.number(),
});

// Asset analysis/variants are optional and filled progressively (upload pipeline + async AI jobs).
const assetVariantValidator = v.object({
  url: v.string(),
  storageKey: v.optional(v.string()),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  byteSize: v.optional(v.number()),
  mimeType: v.optional(v.string()),
});

const i18nTextValidator = v.object({
  it: v.optional(v.string()),
  en: v.optional(v.string()),
});

const i18nStringArrayValidator = v.object({
  it: v.optional(v.array(v.string())),
  en: v.optional(v.array(v.string())),
});

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    avatar: v.optional(v.string()),
    // User-chosen avatar (uploaded). If absent, UI should fall back to `avatar` (auth provider image).
    customAvatar: v.optional(v.string()),
    // Which avatar to display: "auth" (Clerk) or "custom".
    avatarSource: v.optional(v.union(v.literal("auth"), v.literal("custom"))),
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

  boards: defineTable({
    title: v.string(),
    ownerId: v.id("users"),
    ownerName: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    imageUrl: v.optional(v.string()),
    isArchived: v.optional(v.boolean()),
    camera: v.optional(
      v.object({
        x: v.number(),
        y: v.number(),
        scale: v.number(),
      })
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("byOwner", ["ownerId"])
    .index("byProject", ["projectId"])
    .index("byOwnerProject", ["ownerId", "projectId"]),

  boardSharing: defineTable({
    boardId: v.id("boards"),
    userId: v.optional(v.id("users")),
    userEmail: v.optional(v.string()),
    role: v.string(),
    invitedBy: v.id("users"),
    createdAt: v.number(),
    acceptedAt: v.optional(v.number()),
  })
    .index("byBoard", ["boardId"])
    .index("byUser", ["userId"])
    .index("byEmail", ["userEmail"])
    .index("byBoardUser", ["boardId", "userId"])
    .index("byBoardEmail", ["boardId", "userEmail"]),

  boardAccessRequests: defineTable({
    boardId: v.id("boards"),
    requesterId: v.optional(v.id("users")),
    requesterEmail: v.optional(v.string()),
    requestedRole: v.string(), // viewer | editor
    message: v.optional(v.string()),
    status: v.string(), // pending | approved | rejected | message
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("byBoard", ["boardId"])
    .index("byRequester", ["requesterId"])
    .index("byRequesterEmail", ["requesterEmail"])
    .index("byBoardStatus", ["boardId", "status"]),

  media: defineTable({
    userId: v.id("users"),
    boardId: v.optional(v.id("boards")),
    name: v.string(),
    url: v.string(),
    type: v.string(), // image | video | file
    size: v.optional(v.number()),
    mimeType: v.optional(v.string()),
    orgId: v.optional(v.string()),
    userName: v.optional(v.string()),
    userEmail: v.optional(v.string()),
    isFromLibrary: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("byUser", ["userId"])
    .index("byBoard", ["boardId"])
    .index("byUrl", ["url"]),

  assets: defineTable({
    userId: v.id("users"),
    title: v.string(),
    fileUrl: v.string(),
    storageKey: v.optional(v.string()),
    type: v.string(),
    fileName: v.string(),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    tokens: v.optional(v.array(v.string())),
    userTokens: v.optional(v.array(v.string())),
    aiTokensI18n: v.optional(i18nStringArrayValidator),
    description: v.optional(v.string()),
    captionsI18n: v.optional(i18nTextValidator),
    searchText: v.optional(v.string()),
    externalLink: v.optional(v.string()),
    author: v.optional(v.string()),
    isPrivate: v.optional(v.boolean()),
    fileSize: v.optional(v.number()),
    mimeType: v.optional(v.string()),
    sha256: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    durationSeconds: v.optional(v.number()),
    fps: v.optional(v.number()),
    aspectRatio: v.optional(v.number()),
    blurDataUrl: v.optional(v.string()),
    variants: v.optional(
      v.object({
        original: v.optional(assetVariantValidator),
        hires: v.optional(assetVariantValidator),
        preview: v.optional(assetVariantValidator),
        thumb: v.optional(assetVariantValidator),
      })
    ),
    dominantColors: v.optional(v.array(v.string())),
    colorFingerprint: v.optional(v.array(v.number())),
    phash: v.optional(v.string()),
    exif: v.optional(v.any()),
    ocrText: v.optional(v.string()),
    analysisStatus: v.optional(v.string()),
    analysisError: v.optional(v.string()),
    analysisUpdatedAt: v.optional(v.number()),
    analysisVersion: v.optional(v.string()),
    embeddingProvider: v.optional(v.string()),
    embeddingRef: v.optional(v.string()),
    embeddingModel: v.optional(v.string()),
    embeddingDim: v.optional(v.number()),
    embeddingUpdatedAt: v.optional(v.number()),
    source: v.optional(v.string()),
    orgId: v.optional(v.string()),
  })
    .index("byUser", ["userId"])
    .index("byType", ["type"])
    .index("byUserType", ["userId", "type"])
    .index("byUserUpdatedAt", ["userId", "updatedAt"])
    .index("byUserAnalysisStatus", ["userId", "analysisStatus"])
    .index("byFileUrl", ["fileUrl"])
    .index("byStorageKey", ["storageKey"])
    .searchIndex("search_assets", {
      searchField: "title",
      filterFields: ["userId", "type"],
    })
    .searchIndex("search_assets_full", {
      searchField: "searchText",
      filterFields: ["userId", "type"],
    }),

  assetCollections: defineTable({
    ownerId: v.id("users"),
    title: v.string(),
    projectId: v.optional(v.id("projects")),
    coverUrl: v.optional(v.string()),
    coverStorageKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("byOwner", ["ownerId"])
    .index("byOwnerUpdatedAt", ["ownerId", "updatedAt"])
    .index("byProject", ["projectId"]),

  assetCollectionItems: defineTable({
    collectionId: v.id("assetCollections"),
    assetId: v.id("assets"),
    addedBy: v.id("users"),
    addedAt: v.number(),
  })
    .index("byCollection", ["collectionId"])
    .index("byAsset", ["assetId"])
    .index("byCollectionAsset", ["collectionId", "assetId"]),

  assetCollectionSharing: defineTable({
    collectionId: v.id("assetCollections"),
    userId: v.optional(v.id("users")),
    userEmail: v.optional(v.string()),
    groupId: v.optional(v.id("shareGroups")),
    role: v.string(), // viewer | editor
    invitedBy: v.id("users"),
    createdAt: v.number(),
    acceptedAt: v.optional(v.number()),
  })
    .index("byCollection", ["collectionId"])
    .index("byUser", ["userId"])
    .index("byEmail", ["userEmail"])
    .index("byGroup", ["groupId"])
    .index("byCollectionUser", ["collectionId", "userId"])
    .index("byCollectionEmail", ["collectionId", "userEmail"])
    .index("byCollectionGroup", ["collectionId", "groupId"]),

  assetAnalysisJobs: defineTable({
    assetId: v.id("assets"),
    userId: v.id("users"),
    status: v.string(),
    priority: v.optional(v.number()),
    attempts: v.number(),
    maxAttempts: v.number(),
    lockedAt: v.optional(v.number()),
    lockedBy: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    requestedFeatures: v.object({
      ocr: v.boolean(),
      caption: v.boolean(),
      tags: v.boolean(),
      embedding: v.boolean(),
      colors: v.boolean(),
      exif: v.boolean(),
    }),
    resultSummary: v.optional(v.string()),
  })
    .index("byUserCreatedAt", ["userId", "createdAt"])
    .index("byStatusUpdatedAt", ["status", "updatedAt"])
    .index("byAsset", ["assetId"]),

  assetUsages: defineTable({
    assetId: v.id("assets"),
    userId: v.id("users"),
    // "board" | "review" (review = videos table)
    targetType: v.string(),
    targetId: v.string(),
    boardId: v.optional(v.id("boards")),
    videoId: v.optional(v.id("videos")),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("byAsset", ["assetId"])
    .index("byUser", ["userId"])
    .index("byTarget", ["targetType", "targetId"])
    .index("byBoard", ["boardId"])
    .index("byVideo", ["videoId"]),

  todoLists: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    createdAt: v.number(),
    archived: v.optional(v.boolean()),
    color: v.optional(v.string()),
    groups: v.optional(v.array(v.any())),
  })
    .index("byOwner", ["ownerId"])
    .index("byOwnerArchived", ["ownerId", "archived"]),

  todoItems: defineTable({
    listId: v.id("todoLists"),
    text: v.string(),
    completed: v.optional(v.boolean()),
    createdAt: v.number(),
    groupId: v.optional(v.string()),
  }).index("byList", ["listId"]),

  videos: defineTable({
    projectId: v.optional(v.id("projects")),
    ownerId: v.id("users"),
    isEditAsset: v.optional(v.boolean()),
    title: v.string(),
    description: v.optional(v.string()),
    reviewId: v.optional(v.string()),
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

  videoRevisions: defineTable({
    videoId: v.id("videos"),
    storageKey: v.string(),
    publicUrl: v.string(),
    width: v.number(),
    height: v.number(),
    fps: v.number(),
    duration: v.number(),
    thumbnailUrl: v.optional(v.string()),
    createdAt: v.number(),
    label: v.optional(v.string()),
    fileName: v.optional(v.string()),
  }).index("byVideo", ["videoId"]),

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
    audioEnabled: v.optional(v.boolean()),
    hidden: v.optional(v.boolean()),
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

  // Named snapshots of a composition for a given base review (video)
  compositionSaves: defineTable({
    ownerId: v.id("users"),
    videoId: v.id("videos"),
    compositionId: v.id("compositions"),
    name: v.string(),
    snapshot: v.any(), // { composition, clips, tracks }
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("byOwner", ["ownerId"]) 
    .index("byVideo", ["videoId"]) 
    .index("byComposition", ["compositionId"]),

  compositionSaveStates: defineTable({
    ownerId: v.id("users"),
    compositionId: v.id("compositions"),
    videoId: v.id("videos"),
    currentSaveId: v.optional(v.id("compositionSaves")),
    autosaveEnabled: v.boolean(),
    autosaveIntervalMs: v.number(),
    updatedAt: v.number(),
  })
    .index("byOwnerAndComposition", ["ownerId", "compositionId"]) 
    .index("byComposition", ["compositionId"]) 
    .index("byOwnerAndVideo", ["ownerId", "videoId"]),
});
