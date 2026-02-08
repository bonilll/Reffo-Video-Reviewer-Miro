export type AvatarSource = "auth" | "custom";

export const normalizeAvatarSource = (value: unknown): AvatarSource | null => {
  if (value === "auth" || value === "custom") return value;
  return null;
};

// Shared helper: decide which avatar URL to show based on the stored user doc fields.
export const effectiveAvatar = (userDoc: any): string | null => {
  const authAvatar =
    typeof userDoc?.avatar === "string" && userDoc.avatar.trim() ? userDoc.avatar.trim() : null;
  const customAvatar =
    typeof userDoc?.customAvatar === "string" && userDoc.customAvatar.trim()
      ? userDoc.customAvatar.trim()
      : null;

  const source = normalizeAvatarSource(userDoc?.avatarSource) ?? (customAvatar ? "custom" : "auth");
  if (source === "custom" && customAvatar) return customAvatar;
  return authAvatar;
};

