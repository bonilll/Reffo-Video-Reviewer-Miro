import React, { useState } from 'react';
import { useConsent } from '../../contexts/ConsentContext';
import { ConsentCategories } from '../../utils/consentStorage';
import { getServicesByCategory } from '../../legal/services';

const ServiceList: React.FC<{ services?: string[] }> = ({ services }) => {
  if (!services || services.length === 0) {
    return <p className="text-xs text-gray-500">TODO – list third-party services in this category.</p>;
  }
  return (
    <ul className="list-disc pl-5 text-xs text-gray-600">
      {services.map((service) => (
        <li key={service}>{service}</li>
      ))}
    </ul>
  );
};

export const CookiePreferencesModal: React.FC = () => {
  const { preferencesOpen, closePreferences, text, categories, savePreferences, acceptAll, rejectAll, locale } = useConsent();
  const [draft, setDraft] = useState<ConsentCategories>(categories);
  const services = getServicesByCategory(locale);

  React.useEffect(() => {
    setDraft(categories);
  }, [categories, preferencesOpen]);

  if (!preferencesOpen) return null;
  const toggle = (key: keyof ConsentCategories) => {
    if (key === 'necessary') return;
    setDraft((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const Row = (
    label: string,
    summary: string,
    key: keyof ConsentCategories,
    disabled = false,
    items?: { name: string; provider: string; purpose: string }[],
  ) => (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">{label}</p>
          <p className="text-xs text-gray-600">{summary}</p>
        </div>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={draft[key]}
            disabled={disabled}
            onChange={() => toggle(key)}
            className="h-4 w-4 rounded border-gray-300 bg-white"
          />
        </label>
      </div>
      <div className="mt-2 text-xs text-gray-600">
        <span className="font-semibold">{text.cookieModal.servicesLabel}: </span>
        <ServiceList services={items?.map((i) => `${i.name} — ${i.provider}`)} />
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-gray-200 bg-white p-6 text-gray-900 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">{text.cookieModal.title}</h2>
            <p className="mt-2 text-sm text-gray-600">{text.cookieModal.description}</p>
          </div>
          <button onClick={closePreferences} className="text-sm text-gray-500 hover:text-gray-900">✕</button>
        </div>
        <div className="mt-5 space-y-3 text-sm">
          {Row(text.cookieModal.necessaryTitle, text.cookieModal.necessarySummary, 'necessary', true, services.necessary)}
          {Row(text.cookieModal.preferencesTitle, text.cookieModal.preferencesSummary, 'preferences', false, services.preferences)}
          {Row(text.cookieModal.analyticsTitle, text.cookieModal.analyticsSummary, 'analytics', false, services.analytics)}
        </div>
        <div className="mt-6 grid gap-3 text-sm font-semibold md:grid-cols-3">
          <button
            onClick={() => {
              setDraft({ necessary: true, preferences: false, analytics: false, marketing: false });
              rejectAll();
            }}
            className="rounded-full border border-gray-900 px-4 py-2 text-center text-gray-900 transition-colors hover:bg-gray-50"
          >
            {text.cookieModal.rejectAll}
          </button>
          <button
            onClick={() => {
              // Marketing/profiling not used → keep false
              setDraft({ necessary: true, preferences: true, analytics: true, marketing: false });
              // acceptAll also keeps marketing disabled
              acceptAll();
            }}
            className="rounded-full bg-gray-900 px-4 py-2 text-center text-white transition-colors hover:bg-black"
          >
            {text.cookieModal.acceptAll}
          </button>
          <button
            onClick={() => savePreferences(draft)}
            className="rounded-full border border-gray-900 bg-white px-4 py-2 text-center text-gray-900 transition-colors hover:bg-gray-50"
          >
            {text.cookieModal.save}
          </button>
        </div>
      </div>
    </div>
  );
};
