import React from 'react';
import { LegalDoc } from './LegalDoc';
import { COOKIE_POLICY } from '../../legal/legalContent';
import { detectLocale } from '../../locales/legal';
import { getServicesByCategory } from '../../legal/services';

const CookiePolicy: React.FC = () => {
  const locale = detectLocale();
  const services = getServicesByCategory(locale);
  const labels = locale === 'it'
    ? {
        sectionTitle: 'Servizi e identificatori per categoria',
        sectionDescription:
          'Elenco operativo delle tecnologie effettivamente usate dalla piattaforma.',
        service: 'Servizio',
        provider: 'Fornitore',
        purpose: 'Finalità',
        identifiers: 'Identificatori',
        duration: 'Durata',
      }
    : {
        sectionTitle: 'Services and identifiers by category',
        sectionDescription:
          'Operational inventory of technologies currently used by the platform.',
        service: 'Service',
        provider: 'Provider',
        purpose: 'Purpose',
        identifiers: 'Identifiers',
        duration: 'Duration',
      };

  return (
    <div className="space-y-8">
      <LegalDoc doc={COOKIE_POLICY} />
      <section className="mx-auto max-w-4xl px-4">
        <h2 className="text-xl font-semibold text-gray-900">{labels.sectionTitle}</h2>
        <p className="mt-1 text-sm text-gray-600">{labels.sectionDescription}</p>
        {(
          [
            { key: 'necessary', title: locale === 'it' ? 'Strettamente necessari' : 'Strictly necessary' },
            { key: 'preferences', title: locale === 'it' ? 'Preferenze' : 'Preferences' },
            { key: 'analytics', title: locale === 'it' ? 'Statistiche' : 'Analytics' },
          ] as const
        ).map(({ key, title }) => (
          <div key={key} className="mt-4 overflow-x-auto">
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <table className="mt-2 min-w-full text-left text-xs text-gray-700 border border-gray-200">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-3 py-2">{labels.service}</th>
                  <th className="px-3 py-2">{labels.provider}</th>
                  <th className="px-3 py-2">{labels.purpose}</th>
                  <th className="px-3 py-2">{labels.identifiers}</th>
                  <th className="px-3 py-2">{labels.duration}</th>
                </tr>
              </thead>
              <tbody>
                {(services as any)[key].map((s: any) => (
                  <tr key={s.name} className="odd:bg-gray-50">
                    <td className="px-3 py-2 font-semibold">{s.name}</td>
                    <td className="px-3 py-2">{s.provider}</td>
                    <td className="px-3 py-2">{s.purpose}</td>
                    <td className="px-3 py-2">{s.identifiers}</td>
                    <td className="px-3 py-2">{s.duration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>
    </div>
  );
};

export default CookiePolicy;
