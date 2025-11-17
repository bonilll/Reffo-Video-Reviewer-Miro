import React from 'react';
import { LegalDoc } from './LegalDoc';
import { COOKIE_POLICY } from '../../legal/legalContent';
import { detectLocale } from '../../locales/legal';
import { getServicesByCategory } from '../../legal/services';

const CookiePolicy: React.FC = () => {
  const locale = detectLocale();
  const services = getServicesByCategory(locale);
  return (
    <div className="space-y-8">
      <LegalDoc doc={COOKIE_POLICY} note="Placeholders must be replaced with actual vendors/cookies and reviewed by a lawyer." />
      <section className="mx-auto max-w-4xl px-4">
        <h2 className="text-xl font-semibold text-white">Cookies and services by category</h2>
        <p className="mt-1 text-sm text-white/70">Below you find a draft list of services used per category. Update this table with exact cookie names and durations before publication.</p>
        {(
          [
            { key: 'necessary', title: locale === 'it' ? 'Strettamente necessari' : 'Strictly necessary' },
            { key: 'preferences', title: locale === 'it' ? 'Preferenze' : 'Preferences' },
            { key: 'analytics', title: locale === 'it' ? 'Statistiche' : 'Analytics' },
          ] as const
        ).map(({ key, title }) => (
          <div key={key} className="mt-4 overflow-x-auto">
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            <table className="mt-2 min-w-full text-left text-xs text-white/80">
              <thead>
                <tr className="bg-white/10">
                  <th className="px-3 py-2">Service</th>
                  <th className="px-3 py-2">Provider</th>
                  <th className="px-3 py-2">Purpose</th>
                  <th className="px-3 py-2">Cookie(s)</th>
                  <th className="px-3 py-2">Duration</th>
                </tr>
              </thead>
              <tbody>
                {(services as any)[key].map((s: any) => (
                  <tr key={s.name} className="odd:bg-white/5">
                    <td className="px-3 py-2 font-semibold">{s.name}</td>
                    <td className="px-3 py-2">{s.provider}</td>
                    <td className="px-3 py-2">{s.purpose}</td>
                    <td className="px-3 py-2">[TO FILL]</td>
                    <td className="px-3 py-2">[TO FILL]</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        <p className="mt-2 text-[11px] text-white/50">TODO: Replace [TO FILL] with actual cookie names and durations for each service.</p>
      </section>
    </div>
  );
};

export default CookiePolicy;
