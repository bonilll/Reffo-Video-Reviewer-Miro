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

const buildStorageKey = (userId: string, fileName?: string) => {
  const safeFileName = fileName?.replace(/[^a-zA-Z0-9_.-]/g, "");
  const extension = safeFileName?.includes(".")
    ? safeFileName.slice(safeFileName.lastIndexOf("."))
    : "";
  return `users/${userId}/${Date.now()}-${randomUUID()}${extension}`;
};

const buildPublicUrl = (storageKey: string) =>
  `${PUBLIC_BASE.replace(/\/$/, "")}/${storageKey}`;

export const generateVideoUploadUrl = action({
  args: {
    contentType: v.string(),
    fileName: v.optional(v.string()),
  },
  async handler(ctx, { contentType, fileName }) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("NOT_AUTHENTICATED");
    }

    const userId = await ctx.runMutation(api.users.ensure);
    const storageKey = buildStorageKey(userId, fileName ?? undefined);

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: storageKey,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 60 * 5,
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

