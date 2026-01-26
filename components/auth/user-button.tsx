"use client";

import { UserButton as ClerkUserButton } from "@clerk/nextjs";

export const UserButton = () => {
  return (
    <ClerkUserButton
      afterSignOutUrl="/"
      appearance={{
        elements: {
          avatarBox: {
            height: 30,
            width: 30,
          },
        },
      }}
    />
  );
}; 