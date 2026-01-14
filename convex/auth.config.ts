import type { AuthConfig } from "convex/server";

const issuer = process.env.CLERK_JWT_ISSUER ?? "https://clerk.accounts.dev";
const applicationID = process.env.CLERK_JWT_TEMPLATE ?? "convex";

export default {
  providers: [
    {
      domain: issuer,
      applicationID,
    },
  ],
} satisfies AuthConfig;
