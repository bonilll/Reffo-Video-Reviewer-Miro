import React from 'react';
import { useConsent } from '../../contexts/ConsentContext';

export const CookieSettingsTrigger: React.FC<{ variant?: 'footer' | 'floating'; className?: string }> = ({ variant = 'floating', className }) => {
  const { text, openPreferences } = useConsent();
  const isReviewRoute = (() => {
    try {
      if (typeof window === 'undefined') return false;
      return /^\/review\//.test(window.location.pathname);
    } catch {
      return false;
    }
  })();
  if (variant === 'footer') {
    return (
      <button onClick={openPreferences} className={className ?? 'text-xs underline text-white/70 hover:text-white'}>
        {text.footer.cookieSettings}
      </button>
    );
  }
  if (isReviewRoute) return null; // hide floating trigger on reviewer page
  return (
    <button
      onClick={openPreferences}
      className="fixed bottom-4 right-4 z-40 rounded-full border border-white/30 bg-black/70 px-4 py-2 text-xs font-semibold text-white/80 backdrop-blur hover:bg-black/90"
    >
      {text.footer.cookieSettings}
    </button>
  );
};
