import React from 'react';
import { useConsent } from '../../contexts/ConsentContext';

export const CookieSettingsTrigger: React.FC<{ variant?: 'footer' | 'floating'; className?: string }> = ({ variant = 'floating', className }) => {
  const { text, openPreferences } = useConsent();
  if (variant === 'footer') {
    return (
      <button onClick={openPreferences} className={className ?? 'text-xs underline text-white/70 hover:text-white'}>
        {text.footer.cookieSettings}
      </button>
    );
  }
  return (
    <button
      onClick={openPreferences}
      className="fixed bottom-4 right-4 z-40 rounded-full border border-white/30 bg-black/70 px-4 py-2 text-xs font-semibold text-white/80 backdrop-blur hover:bg-black/90"
    >
      {text.footer.cookieSettings}
    </button>
  );
};
