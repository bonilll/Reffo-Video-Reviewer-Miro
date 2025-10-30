import type { AuthConfig } from "convex/server";

const issuer = process.env.CLERK_JWT_ISSUER ?? "https://clerk.accounts.dev";

export default {
  providers: [
    {
      domain: issuer,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;

