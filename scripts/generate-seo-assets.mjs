#!/usr/bin/env node

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = process.cwd();
const publicDir = resolve(projectRoot, "public");

if (!existsSync(publicDir)) {
  mkdirSync(publicDir, { recursive: true });
}

const baseUrl = (process.env.VITE_PUBLIC_SITE_URL || "https://reffo.studio").replace(/\/$/, "");
const today = new Date().toISOString().slice(0, 10);

const indexableRoutes = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/privacy-policy", changefreq: "yearly", priority: "0.3" },
  { path: "/cookie-policy", changefreq: "yearly", priority: "0.3" },
  { path: "/terms-of-use", changefreq: "yearly", priority: "0.3" },
];

const robotsTxt = [
  "User-agent: *",
  "Disallow: /workspaces",
  // Legacy path (now redirects to /workspaces)
  "Disallow: /dashboard",
  "Disallow: /library",
  "Disallow: /profile",
  "Disallow: /project/",
  "Disallow: /board/",
  "Disallow: /review/",
  "Disallow: /edit/",
  "Disallow: /share/",
  `Sitemap: ${baseUrl}/sitemap.xml`,
  "",
].join("\n");

const sitemapXml =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  indexableRoutes
    .map(
      ({ path, changefreq, priority }) =>
        `  <url>\n` +
        `    <loc>${baseUrl}${path}</loc>\n` +
        `    <lastmod>${today}</lastmod>\n` +
        `    <changefreq>${changefreq}</changefreq>\n` +
        `    <priority>${priority}</priority>\n` +
        `  </url>`
    )
    .join("\n") +
  `\n</urlset>\n`;

const webManifest = {
  name: "Reffo",
  short_name: "Reffo",
  start_url: "/",
  display: "standalone",
  background_color: "#ffffff",
  theme_color: "#111827",
  icons: [
    {
      src: "/icon.svg",
      sizes: "any",
      type: "image/svg+xml",
    },
  ],
};

writeFileSync(resolve(publicDir, "robots.txt"), robotsTxt, "utf8");
writeFileSync(resolve(publicDir, "sitemap.xml"), sitemapXml, "utf8");
writeFileSync(resolve(publicDir, "site.webmanifest"), JSON.stringify(webManifest, null, 2) + "\n", "utf8");
