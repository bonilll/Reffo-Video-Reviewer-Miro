import React from 'react';
import { useConsent } from '../../contexts/ConsentContext';

export const CookieBanner: React.FC = () => {
  const { bannerVisible, text, acceptAll, rejectAll, openPreferences } = useConsent();
  if (!bannerVisible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4">
      <div className="mx-auto max-w-4xl rounded-3xl border border-gray-200 bg-white p-6 text-gray-900 shadow-2xl">
        <h3 className="text-lg font-semibold">{text.cookieBanner.title}</h3>
        <p className="mt-2 text-sm text-gray-600">{text.cookieBanner.description}</p>
        <div className="mt-4 flex flex-col gap-3 text-sm font-semibold md:flex-row md:items-center">
          <button
            onClick={rejectAll}
            className="flex-1 rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-center text-gray-900 transition-colors hover:bg-gray-200"
          >
            {text.cookieBanner.rejectAll}
          </button>
          <button
            onClick={openPreferences}
            className="flex-1 rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-center text-gray-900 transition-colors hover:bg-gray-200"
          >
            {text.cookieBanner.customize}
          </button>
          <button
            onClick={acceptAll}
            className="flex-1 rounded-full border border-gray-200 bg-white px-4 py-2 text-center text-gray-900 transition-colors hover:bg-gray-50"
          >
            {text.cookieBanner.acceptAll}
          </button>
        </div>
      </div>
    </div>
  );
};
