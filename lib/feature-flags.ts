const isTruthyEnvValue = (value: unknown) => {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
};

export const isMobileBoardV2Enabled = () => {
  return isTruthyEnvValue(import.meta.env.VITE_MOBILE_BOARD_V2);
};

export const isMobileBoardReadOnlyEnabled = () => {
  return isTruthyEnvValue(import.meta.env.VITE_MOBILE_BOARD_READONLY);
};

export const isAiSubnetworkEnabled = () => {
  if (import.meta.env.DEV) return true;
  return isTruthyEnvValue(import.meta.env.VITE_AI_SUBNETWORK_ENABLED);
};
