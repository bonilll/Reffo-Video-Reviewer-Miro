import React from 'react';
import { useConsent } from '../../contexts/ConsentContext';

export const LanguageSwitcher: React.FC<{ compact?: boolean; className?: string }> = ({ compact = false, className }) => {
  const { locale, setLocale } = useConsent();
  const Button = ({ code, label }: { code: 'en' | 'it'; label: string }) => (
    <button
      onClick={() => setLocale(code)}
      className={`${
        locale === code ? 'bg-white/20 text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'
      } rounded-full px-3 py-1 text-xs font-semibold`}
      title={label}
    >
      {label}
    </button>
  );
  return (
    <div className={className ?? 'flex items-center gap-2'}>
      {!compact && <span className="text-xs text-white/60">Language:</span>}
      <Button code="en" label="EN" />
      <Button code="it" label="IT" />
    </div>
  );
};

