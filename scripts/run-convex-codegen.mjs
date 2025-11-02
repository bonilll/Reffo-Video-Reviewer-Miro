#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const shouldSkipCodegen = Boolean(process.env.VERCEL) &&
  !process.env.CONVEX_DEPLOY_KEY &&
  !process.env.CONVEX_SELF_HOSTED_URL &&
  !process.env.CONVEX_DEPLOYMENT;

if (shouldSkipCodegen) {
  console.log(
    "Skipping Convex codegen: no deployment configuration found in Vercel build environment."
  );
  process.exit(0);
}

const result = spawnSync("npx", ["convex", "codegen"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

