// Manually-generated sitemap. Add new pages to the array below.
// This replaces @astrojs/sitemap which has a bug with Astro 4 + static builds.

const SITE_URL = 'https://clubshed.pro';

const pages = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/pricing/', priority: '0.9', changefreq: 'monthly' },
  { path: '/about/', priority: '0.8', changefreq: 'monthly' },
  { path: '/compare/spond/', priority: '0.85', changefreq: 'monthly' },
  { path: '/templates/inventory-spreadsheet/', priority: '0.8', changefreq: 'monthly' },
  { path: '/blog/', priority: '0.8', changefreq: 'weekly' },
  { path: '/blog/how-to-start-grassroots-football-club/', priority: '0.85', changefreq: 'monthly' },
  { path: '/blog/football-kit-ordering-guide-grassroots/', priority: '0.85', changefreq: 'monthly' },
  { path: '/blog/football-foundation-grants-equipment-grassroots/', priority: '0.85', changefreq: 'monthly' },
  { path: '/blog/end-of-season-equipment-audit/', priority: '0.85', changefreq: 'monthly' },
  { path: '/blog/grassroots-football-equipment-guide/', priority: '0.7', changefreq: 'monthly' },
  { path: '/contact/', priority: '0.5', changefreq: 'yearly' },
  { path: '/privacy/', priority: '0.3', changefreq: 'yearly' },
];

const today = new Date().toISOString().split('T')[0];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map(
    (page) => `  <url>
    <loc>${SITE_URL}${page.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

export async function GET() {
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
    },
  });
}
