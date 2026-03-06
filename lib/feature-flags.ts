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
  const raw = import.meta.env.VITE_AI_SUBNETWORK_ENABLED;
  // Fail-open in production when env is missing to avoid breaking access
  // to existing subnetworks after deployment/config drift.
  if (raw === undefined || raw === null || String(raw).trim() === "") return true;
  return isTruthyEnvValue(raw);
};

export const isAiGoogleImageModelsV2Enabled = () => {
  if (import.meta.env.DEV) return true;
  const raw = import.meta.env.VITE_AI_GOOGLE_IMAGE_MODELS_V2;
  if (raw === undefined || raw === null || String(raw).trim() === "") return true;
  return isTruthyEnvValue(raw);
};

export const isAiGoogleBatchEnabled = () => {
  if (import.meta.env.DEV) return true;
  const raw = import.meta.env.VITE_AI_GOOGLE_BATCH_ENABLED;
  if (raw === undefined || raw === null || String(raw).trim() === "") return true;
  return isTruthyEnvValue(raw);
};
