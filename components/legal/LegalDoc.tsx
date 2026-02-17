import React from 'react';
import { detectLocale, SupportedLocale } from '../../locales/legal';
import { LegalDocument } from '../../legal/legalContent';

interface Props {
  doc: Record<SupportedLocale, LegalDocument>;
  note?: string;
}

export const LegalDoc: React.FC<Props> = ({ doc, note }) => {
  const locale = detectLocale();
  const content = doc[locale];
  const labels = locale === 'it'
    ? {
        version: 'Versione',
        updated: 'Aggiornato',
        identifier: 'Identificatore',
        provider: 'Fornitore',
        purpose: 'Finalita',
        category: 'Categoria',
        duration: 'Durata',
        type: 'Tipo',
      }
    : {
        version: 'Version',
        updated: 'Updated',
        identifier: 'Identifier',
        provider: 'Provider',
        purpose: 'Purpose',
        category: 'Category',
        duration: 'Duration',
        type: 'Type',
      };

  return (
    <article className="mx-auto max-w-4xl space-y-6 px-4 py-10 text-sm leading-relaxed text-gray-800">
      <header>
        <p className="text-xs uppercase tracking-wide text-gray-500">
          {labels.version} {content.version} · {labels.updated} {content.updatedAt}
        </p>
        <h1 className="text-3xl font-bold text-gray-900">{content.title}</h1>
        {note && <p className="mt-2 text-xs text-gray-600">{note}</p>}
      </header>
      {content.sections.map((section) => (
        <section key={section.heading} className="space-y-2">
          <h2 className="text-xl font-semibold text-gray-900">{section.heading}</h2>
          {section.body.map((paragraph, idx) => (
            <p key={idx} className="text-gray-800">{paragraph}</p>
          ))}
        </section>
      ))}
      {content.tables?.map((table) => (
        <section key={table.heading} className="space-y-2">
          <h2 className="text-xl font-semibold text-gray-900">{table.heading}</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs text-gray-700 border border-gray-200">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-3 py-2">{labels.identifier}</th>
                  <th className="px-3 py-2">{labels.provider}</th>
                  <th className="px-3 py-2">{labels.purpose}</th>
                  <th className="px-3 py-2">{labels.category}</th>
                  <th className="px-3 py-2">{labels.duration}</th>
                  <th className="px-3 py-2">{labels.type}</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row) => (
                  <tr key={row.name} className="odd:bg-gray-50">
                    <td className="px-3 py-2 font-semibold">{row.name}</td>
                    <td className="px-3 py-2">{row.provider}</td>
                    <td className="px-3 py-2">{row.purpose}</td>
                    <td className="px-3 py-2">{row.category}</td>
                    <td className="px-3 py-2">{row.duration}</td>
                    <td className="px-3 py-2">{row.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </article>
  );
};
