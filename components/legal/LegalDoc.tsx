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
  return (
    <article className="mx-auto max-w-4xl space-y-6 px-4 py-10 text-sm leading-relaxed text-white">
      <header>
        <p className="text-xs uppercase tracking-wide text-white/50">Version {content.version} · Updated {content.updatedAt}</p>
        <h1 className="text-3xl font-bold text-white">{content.title}</h1>
        {note && <p className="mt-2 text-xs text-white/60">{note}</p>}
      </header>
      {content.sections.map((section) => (
        <section key={section.heading} className="space-y-2">
          <h2 className="text-xl font-semibold text-white">{section.heading}</h2>
          {section.body.map((paragraph, idx) => (
            <p key={idx} className="text-white/80">{paragraph}</p>
          ))}
        </section>
      ))}
      {content.tables?.map((table) => (
        <section key={table.heading} className="space-y-2">
          <h2 className="text-xl font-semibold text-white">{table.heading}</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs text-white/80">
              <thead>
                <tr className="bg-white/10">
                  <th className="px-3 py-2">Cookie</th>
                  <th className="px-3 py-2">Provider</th>
                  <th className="px-3 py-2">Purpose</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Duration</th>
                  <th className="px-3 py-2">Type</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row) => (
                  <tr key={row.name} className="odd:bg-white/5">
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
      <p className="text-xs text-white/50">
        TODO: This is a technical draft. Replace placeholders (company, address, vendors) and ask a qualified lawyer to review before publishing.
      </p>
    </article>
  );
};
