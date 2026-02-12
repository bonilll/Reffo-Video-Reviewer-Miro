export const isMobileBoardV2Enabled = () => {
  const raw = String(import.meta.env.VITE_MOBILE_BOARD_V2 ?? "")
    .trim()
    .toLowerCase();

  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
};

