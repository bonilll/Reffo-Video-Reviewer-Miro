#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const isVercel = Boolean(process.env.VERCEL);
const hasCloudCredentials = Boolean(process.env.CONVEX_DEPLOY_KEY);
const hasSelfHostedCredentials =
  Boolean(process.env.CONVEX_SELF_HOSTED_URL) &&
  Boolean(process.env.CONVEX_SELF_HOSTED_ADMIN_KEY);

const shouldSkipCodegen = isVercel && !hasCloudCredentials && !hasSelfHostedCredentials;

if (shouldSkipCodegen) {
  process.exit(0);
}

const result = spawnSync("npx", ["convex", "codegen"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

