"use node";

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { ConvexError } from "convex/values";

const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new ConvexError(`Missing environment variable ${name}`);
  }
  return value;
};

const REGION = process.env.MINIO_REGION ?? "us-east-1";
const ENDPOINT = requiredEnv("MINIO_ENDPOINT");
const BUCKET = requiredEnv("MINIO_BUCKET");

const s3Client = new S3Client({
  region: REGION,
  endpoint: ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: requiredEnv("MINIO_ACCESS_KEY"),
    secretAccessKey: requiredEnv("MINIO_SECRET_KEY"),
  },
});

export async function createUploadUrl(options: {
  ownerId: string;
  contentType: string;
  fileName?: string;
}) {
  const { ownerId, contentType, fileName } = options;
  const extension = fileName?.includes(".")
    ? fileName.slice(fileName.lastIndexOf("."))
    : "";
  const storageKey = `users/${ownerId}/${Date.now()}-${randomUUID()}${extension}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 * 5 });

  return {
    uploadUrl,
    storageKey,
  };
}

export async function createDownloadUrl(storageKey: string, expiresInSeconds = 60 * 60) {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
  });

  return await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}

export async function removeObject(storageKey: string) {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
  });
  await s3Client.send(command);
}

