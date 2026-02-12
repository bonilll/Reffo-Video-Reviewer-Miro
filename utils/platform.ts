export const isIOSSafari = (): boolean => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";

  const isIOS = /iPad|iPhone|iPod/.test(ua);
  if (!isIOS) return false;

  // iOS browsers embed WebKit in UA; exclude common iOS in-app/alt browsers.
  const isWebKit = /WebKit/i.test(ua);
  const isCriOS = /CriOS/i.test(ua);
  const isFxiOS = /FxiOS/i.test(ua);
  const isEdgiOS = /EdgiOS/i.test(ua);

  return isWebKit && !isCriOS && !isFxiOS && !isEdgiOS;
};

