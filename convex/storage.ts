"use node";

import {
  action,
  internalAction,
} from "./_generated/server";
import { api } from "./_generated/api";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { ConvexError, v } from "convex/values";

const env = (key: string, fallback?: string) => {
  const value = process.env[key] ?? fallback;
  if (!value) {
    throw new ConvexError(`Missing environment variable ${key}`);
  }
  return value;
};

const REGION = process.env.MINIO_REGION ?? "us-east-1";
const ENDPOINT = env("MINIO_ENDPOINT");
const BUCKET = env("MINIO_BUCKET");
const PUBLIC_BASE = env(
  "MINIO_PUBLIC_URL",
  `${ENDPOINT.replace(/\/$/, "")}/${BUCKET}`,
);

const s3Client = new S3Client({
  region: REGION,
  endpoint: ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: env("MINIO_ACCESS_KEY"),
    secretAccessKey: env("MINIO_SECRET_KEY"),
  },
});

// Configure how long pre-signed PUT/GET URLs remain valid.
// Longer TTL helps slow connections and large files avoid mid-upload expiry.
// Override with MINIO_UPLOAD_TTL_SECONDS in Convex env (default 3600s = 1h).
const UPLOAD_TTL_SECONDS = (() => {
  const raw = process.env.MINIO_UPLOAD_TTL_SECONDS;
  const n = raw ? Number(raw) : 3600;
  return Number.isFinite(n) && n > 0 ? n : 3600;
})();

type UploadContext = "review" | "board" | "library";

const sanitizePathSegment = (value: string) =>
  value.replace(/[^a-zA-Z0-9_-]/g, "");

const buildStorageKey = (
  userId: string,
  options?: { context?: UploadContext; contextId?: string; fileName?: string },
) => {
  const safeFileName = options?.fileName?.replace(/[^a-zA-Z0-9_.-]/g, "");
  const extension = safeFileName?.includes(".")
    ? safeFileName.slice(safeFileName.lastIndexOf("."))
    : "";
  const safeUserId = sanitizePathSegment(userId);
  const context = options?.context ?? "review";
  const contextId = options?.contextId ? sanitizePathSegment(options.contextId) : null;
  if ((context === "review" || context === "board") && !contextId) {
    throw new ConvexError("MISSING_CONTEXT_ID");
  }
  const folder =
    context === "review"
      ? `reviews/${contextId}`
      : context === "board"
        ? `boards/${contextId}`
        : "library";
  return `uploads/${safeUserId}/${folder}/${Date.now()}-${randomUUID()}${extension}`;
};

const buildAvatarKey = (userId: string, fileName?: string) => {
  const safeFileName = fileName?.replace(/[^a-zA-Z0-9_.-]/g, "avatar");
  const extension = safeFileName?.includes(".")
    ? safeFileName.slice(safeFileName.lastIndexOf("."))
    : ".jpg";
  return `video_review/users/${userId}/profile/avatar-${Date.now()}${extension}`;
};

const buildAnnotationKey = (
  userId: string,
  videoId: string,
  assetType: "image" | "video",
  fileName?: string,
) => {
  const safeFileName = fileName?.replace(/[^a-zA-Z0-9_.-]/g, "annotation");
  const extension = safeFileName?.includes(".")
    ? safeFileName.slice(safeFileName.lastIndexOf("."))
    : assetType === "image"
      ? ".jpg"
      : ".mp4";
  const safeVideoId = videoId.replace(/[^a-zA-Z0-9_-]/g, "");
  const folder = assetType === "image" ? "images" : "videos";
  return `video_review/users/${userId}/annotations/${safeVideoId}/${folder}/${Date.now()}-${randomUUID()}${extension}`;
};

const buildPublicUrl = (storageKey: string) =>
  `${PUBLIC_BASE.replace(/\/$/, "")}/${storageKey}`;

const publicUrlToKey = (url: string): string | null => {
  const base = PUBLIC_BASE.replace(/\/$/, "");
  if (url.startsWith(base + "/")) {
    return url.slice(base.length + 1);
  }
  try {
    const u = new URL(url);
    // Try to find the <bucket>/<key> in the pathname
    const path = u.pathname.replace(/^\//, "");
    if (!path) return null;
    // If path starts with the bucket, strip it
    const p = path.startsWith(BUCKET + "/") ? path.slice(BUCKET.length + 1) : path;
    return p || null;
  } catch {
    return null;
  }
};

export const generateVideoUploadUrl = action({
  args: {
    contentType: v.string(),
    fileName: v.optional(v.string()),
    context: v.optional(v.union(v.literal("review"), v.literal("board"), v.literal("library"))),
    contextId: v.optional(v.string()),
  },
  async handler(ctx, { contentType, fileName, context, contextId }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("NOT_AUTHENTICATED");
    }

    const current = await ctx.runQuery(api.users.current, {});
    if (!current?._id) {
      throw new ConvexError("NOT_PROVISIONED");
    }
    const userId = current._id as string;
    const storageKey = buildStorageKey(userId, {
      context,
      contextId,
      fileName: fileName ?? undefined,
    });

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: UPLOAD_TTL_SECONDS,
  });

    return {
      storageKey,
      uploadUrl,
      publicUrl: buildPublicUrl(storageKey),
    };
  },
});

// Multipart upload lifecycle for large files (Cloudflare/proxy friendly)
export const createMultipartUpload = action({
  args: {
    contentType: v.string(),
    fileName: v.optional(v.string()),
    context: v.optional(v.union(v.literal("review"), v.literal("board"), v.literal("library"))),
    contextId: v.optional(v.string()),
  },
  async handler(ctx, { contentType, fileName, context, contextId }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("NOT_AUTHENTICATED");
    const current = await ctx.runQuery(api.users.current, {});
    if (!current?._id) throw new ConvexError("NOT_PROVISIONED");
    const userId = current._id as string;
    const storageKey = buildStorageKey(userId, {
      context,
      contextId,
      fileName: fileName ?? undefined,
    });
    const cmd = new CreateMultipartUploadCommand({ Bucket: BUCKET, Key: storageKey, ContentType: contentType });
    const res = await s3Client.send(cmd);
    if (!res.UploadId) throw new ConvexError('FAILED_TO_CREATE_MULTIPART');
    return { storageKey, uploadId: res.UploadId, publicUrl: buildPublicUrl(storageKey) };
  },
});

export const getMultipartUploadUrls = action({
  args: {
    storageKey: v.string(),
    uploadId: v.string(),
    partNumbers: v.array(v.number()),
    contentType: v.string(),
  },
  async handler(_ctx, { storageKey, uploadId, partNumbers, contentType }) {
    const urls = await Promise.all(
      partNumbers.map(async (n) => {
        const cmd = new UploadPartCommand({ Bucket: BUCKET, Key: storageKey, UploadId: uploadId, PartNumber: n, ContentMD5: undefined, Body: undefined, ContentLength: undefined, ChecksumAlgorithm: undefined, ChecksumCRC32: undefined, ChecksumCRC32C: undefined, ChecksumSHA1: undefined, ChecksumSHA256: undefined, SSECustomerAlgorithm: undefined, SSECustomerKey: undefined, SSECustomerKeyMD5: undefined, RequestPayer: undefined, ExpectedBucketOwner: undefined });
        const url = await getSignedUrl(s3Client, cmd, { expiresIn: UPLOAD_TTL_SECONDS });
        return { partNumber: n, url };
      })
    );
    return { urls };
  },
});

export const completeMultipartUpload = action({
  args: {
    storageKey: v.string(),
    uploadId: v.string(),
    parts: v.array(v.object({ ETag: v.string(), PartNumber: v.number() })),
  },
  async handler(_ctx, { storageKey, uploadId, parts }) {
    const cmd = new CompleteMultipartUploadCommand({
      Bucket: BUCKET,
      Key: storageKey,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts.map((p) => ({ ETag: p.ETag, PartNumber: p.PartNumber })) },
    });
    await s3Client.send(cmd);
    return { publicUrl: buildPublicUrl(storageKey) };
  },
});

export const abortMultipartUpload = action({
  args: { storageKey: v.string(), uploadId: v.string() },
  async handler(_ctx, { storageKey, uploadId }) {
    const cmd = new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: storageKey, UploadId: uploadId });
    await s3Client.send(cmd);
    return { aborted: true };
  },
});

export const generateProfileImageUploadUrl = action({
  args: {
    contentType: v.string(),
    fileName: v.optional(v.string()),
  },
  async handler(ctx, { contentType, fileName }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("NOT_AUTHENTICATED");
    }

    const current = await ctx.runQuery(api.users.current, {});
    if (!current?._id) {
      throw new ConvexError("NOT_PROVISIONED");
    }
    const userId = current._id as string;
    const storageKey = buildAvatarKey(userId, fileName ?? undefined);

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: storageKey,
      ContentType: contentType,
      ACL: undefined,
    });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: UPLOAD_TTL_SECONDS });
    return { storageKey, uploadUrl, publicUrl: buildPublicUrl(storageKey) };
  },
});

export const generateAnnotationAssetUploadUrl = action({
  args: {
    contentType: v.string(),
    fileName: v.optional(v.string()),
    videoId: v.id("videos"),
    assetType: v.union(v.literal("image"), v.literal("video")),
  },
  async handler(ctx, { contentType, fileName, videoId, assetType }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("NOT_AUTHENTICATED");
    }

    const current = await ctx.runQuery(api.users.current, {});
    if (!current?._id) {
      throw new ConvexError("NOT_PROVISIONED");
    }
    const userId = current._id as string;
    const storageKey = buildAnnotationKey(userId, videoId, assetType, fileName ?? undefined);

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: storageKey,
      ContentType: contentType,
    });

  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: UPLOAD_TTL_SECONDS,
  });

    return {
      storageKey,
      uploadUrl,
      publicUrl: buildPublicUrl(storageKey),
    };
  },
});

export const deleteObject = internalAction({
  args: {
    storageKey: v.string(),
  },
  async handler(_ctx, { storageKey }) {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: storageKey,
    });
    await s3Client.send(command);
  },
});

export const deleteObjectByPublicUrl = internalAction({
  args: { publicUrl: v.string() },
  async handler(_ctx, { publicUrl }) {
    const key = publicUrlToKey(publicUrl);
    if (!key) return;
    const command = new DeleteObjectCommand({ Bucket: BUCKET, Key: key });
    await s3Client.send(command);
  },
});

export const getPublicUrl = action({
  args: {
    storageKey: v.string(),
  },
  async handler(ctx, { storageKey }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("NOT_AUTHENTICATED");
    }

    return buildPublicUrl(storageKey);
  },
});

export const getDownloadUrl = action({
  args: {
    storageKey: v.string(),
    expiresIn: v.optional(v.number()),
  },
  async handler(ctx, { storageKey, expiresIn }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("NOT_AUTHENTICATED");
    }
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: storageKey,
    });
    const url = await getSignedUrl(s3Client, command, {
      expiresIn: expiresIn ?? 60 * 60,
    });
    return url;
  },
});
