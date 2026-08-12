#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const EXCLUDE_DIRS = new Set([
  'cs\\Hostinger - CzechALert',
  'Hostinger - CzechALert',
  'studio-czechalert-website',
  'node',
  'node_modules',
  'sass',
  'media',
  'media-bez-komprese',
  'icons',
  'js',
  'css',
  'php',
  'tmp',
  'tools',
  '.git',
  '.github',
  '.vscode'
]);

function parseArg(name, fallback) {
  const idx = process.argv.findIndex(a => a === name || a.startsWith(name + '='));
  if (idx === -1) return fallback;
  const val = process.argv[idx].includes('=') ? process.argv[idx].split('=')[1] : process.argv[idx + 1];
  return val || fallback;
}

const baseUrl = parseArg('--base', process.env.BASE_URL || '').replace(/\/$/, '');
if (!baseUrl) {
  console.error('Missing base URL. Provide with --base https://your-domain or set BASE_URL env.');
  process.exit(1);
}

const ROOT = process.cwd();

function isExcludedDir(rel) {
  const parts = rel.split(path.sep);
  if (parts.length === 0) return false;
  // If any path segment is in the exclude list, skip
  return parts.some(seg => EXCLUDE_DIRS.has(seg));
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel = path.relative(ROOT, full);
    if (isExcludedDir(rel)) continue;
    if (e.isDirectory()) {
      files = files.concat(walk(full));
    } else if (e.isFile() && e.name.endsWith('.html')) {
      files.push(full);
    }
  }
  return files;
}

function readFileUtf8(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

function extractCanonical(html) {
  const m = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i);
  return m ? m[1] : null;
}

function extractAlternates(html) {
  const regex = /<link[^>]*rel=["']alternate["'][^>]*hreflang=["']([^"']+)["'][^>]*href=["']([^"']+)["'][^>]*>/ig;
  const alts = [];
  let m;
  while ((m = regex.exec(html)) !== null) {
    alts.push({ hreflang: m[1], href: m[2] });
  }
  return alts;
}

function toAbsolute(urlPath) {
  if (!urlPath) return null;
  if (/^https?:\/\//i.test(urlPath)) return urlPath;
  // ensure leading slash
  const p = urlPath.startsWith('/') ? urlPath : '/' + urlPath.replace(/^\.\//, '').replace(/\\/g, '/');
  return baseUrl + p;
}

function isoDateFromMtime(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return new Date(stat.mtime).toISOString().split('T')[0];
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

function priorityFor(relPath) {
  const name = path.basename(relPath).toLowerCase();
  if (name === 'index.html') return '1.0';
  return '0.7';
}


// Separate files for root and /cs/ directory
const allFiles = walk(ROOT).filter(p => {
  const rel = path.relative(ROOT, p).replace(/\\/g, '/');
  if (rel.startsWith('Hostinger - CzechALert/')) return false;
  return true;
});

const rootFiles = allFiles.filter(p => {
  const rel = path.relative(ROOT, p).replace(/\\/g, '/');
  return !rel.startsWith('cs/');
});
const csFiles = allFiles.filter(p => {
  const rel = path.relative(ROOT, p).replace(/\\/g, '/');
  return rel.startsWith('cs/');
});

function buildUrls(files) {
  const urls = [];
  for (const file of files) {
    const html = readFileUtf8(file);
    const canonical = extractCanonical(html);
    const loc = toAbsolute(canonical) || toAbsolute('/' + path.relative(ROOT, file).replace(/\\/g, '/'));
    if (!loc) continue;
    const lastmod = isoDateFromMtime(file);
    const changefreq = 'weekly';
    const priority = priorityFor(file);
    const alternates = extractAlternates(html).map(a => ({ hreflang: a.hreflang, href: toAbsolute(a.href) }));
    urls.push({ loc, lastmod, changefreq, priority, alternates });
  }
  return urls;
}

function buildSitemap(urls) {
  const header = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n`;
  const footer = `</urlset>\n`;
  let body = '';
  for (const u of urls) {
    body += '  <url>\n';
    body += `    <loc>${u.loc}</loc>\n`;
    body += `    <lastmod>${u.lastmod}</lastmod>\n`;
    body += `    <changefreq>${u.changefreq}</changefreq>\n`;
    body += `    <priority>${u.priority}</priority>\n`;
    for (const alt of u.alternates) {
      if (!alt.href) continue;
      body += `    <xhtml:link rel="alternate" hreflang="${alt.hreflang}" href="${alt.href}" />\n`;
    }
    body += '  </url>\n';
  }
  return header + body + footer;
}

// ---------------------------------------------------------------------------
// Dynamic Sanity articles
// ---------------------------------------------------------------------------
// Articles live in Sanity's public `production` dataset and are served
// client-side at `/article?slug=<slug>` (EN) and `/cs/article?slug=<slug>` (CS).
// Because they are query-string routes rendered by JS, the static file walk
// above never sees them — so we fetch the slugs directly from Sanity's public
// query API (no token required for a public dataset) and emit them here.
const SANITY_PROJECT_ID = process.env.SANITY_PROJECT_ID || '8z0tbe2a';
const SANITY_DATASET = process.env.SANITY_DATASET || 'production';
const SANITY_API_VERSION = '2023-10-01';

// XML-escape a URL for safe inclusion in <loc>/href (handles & in query strings).
function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Build the public GROQ query URL for all published posts + their translation link.
function buildSanityQueryUrl() {
  const groq = `*[_type=="post" && defined(slug.current)]{"slug":slug.current,language,publishedAt,_id,_updatedAt,"translationRef":translationOf._ref}`;
  const q = encodeURIComponent(groq);
  return `https://${SANITY_PROJECT_ID}.api.sanity.io/v${SANITY_API_VERSION}/data/query/${SANITY_DATASET}?query=${q}`;
}

// Compose the absolute, locale-aware article URL for a given post.
function articleUrlFor(post) {
  const base = post.language === 'cs' ? '/cs/article' : '/article';
  return `${baseUrl}${base}?slug=${encodeURIComponent(post.slug)}`;
}

// Turn ISO timestamp into YYYY-MM-DD (falls back to today).
function isoDateFromString(iso) {
  const d = iso ? new Date(iso) : new Date();
  return (Number.isNaN(d.getTime()) ? new Date() : d).toISOString().split('T')[0];
}

async function fetchSanityArticles() {
  if (typeof fetch !== 'function') {
    console.warn('Global fetch unavailable (Node < 18) — skipping Sanity articles.');
    return { rootUrls: [], csUrls: [] };
  }

  let posts;
  try {
    const res = await fetch(buildSanityQueryUrl());
    if (!res.ok) throw new Error(`Sanity API returned HTTP ${res.status}`);
    const json = await res.json();
    posts = Array.isArray(json.result) ? json.result : [];
  } catch (err) {
    console.warn('Failed to fetch Sanity articles — sitemap will exclude them:', err.message);
    return { rootUrls: [], csUrls: [] };
  }

  // Index posts by _id so we can resolve translation pairs for hreflang.
  const byId = new Map(posts.map(p => [p._id, p]));

  // Resolve the translated counterpart of a post, checking both directions
  // (the manual `translationOf` reference is not guaranteed to be reciprocal).
  function translationOf(post) {
    if (post.translationRef && byId.has(post.translationRef)) {
      return byId.get(post.translationRef);
    }
    return posts.find(p => p.translationRef === post._id) || null;
  }

  const rootUrls = [];
  const csUrls = [];

  for (const post of posts) {
    if (!post.slug) continue;
    const loc = xmlEscape(articleUrlFor(post));
    const twin = translationOf(post);

    // Build reciprocal hreflang alternates so Google understands the EN/CS pair.
    const alternates = [];
    const enPost = post.language === 'en' ? post : (twin && twin.language === 'en' ? twin : null);
    const csPost = post.language === 'cs' ? post : (twin && twin.language === 'cs' ? twin : null);
    if (enPost) alternates.push({ hreflang: 'en', href: xmlEscape(articleUrlFor(enPost)) });
    if (csPost) alternates.push({ hreflang: 'cs', href: xmlEscape(articleUrlFor(csPost)) });
    // x-default points at the English article when available, else the post itself.
    alternates.push({ hreflang: 'x-default', href: xmlEscape(articleUrlFor(enPost || post)) });

    const entry = {
      loc,
      lastmod: isoDateFromString(post._updatedAt || post.publishedAt),
      changefreq: 'weekly',
      priority: '0.8',
      alternates,
    };

    if (post.language === 'cs') {
      csUrls.push(entry);
    } else {
      rootUrls.push(entry);
    }
  }

  console.log(`Fetched ${posts.length} Sanity posts (${rootUrls.length} EN, ${csUrls.length} CS)`);
  return { rootUrls, csUrls };
}

(async () => {
  const staticRootUrls = buildUrls(rootFiles);
  const staticCsUrls = buildUrls(csFiles);

  const { rootUrls: articleRootUrls, csUrls: articleCsUrls } = await fetchSanityArticles();

  const rootUrls = staticRootUrls.concat(articleRootUrls);
  const csUrls = staticCsUrls.concat(articleCsUrls);

  const rootSitemap = buildSitemap(rootUrls);
  const csSitemap = buildSitemap(csUrls);

  const rootOutPath = path.join(ROOT, 'sitemap.xml');
  const csOutPath = path.join(ROOT, 'cs', 'sitemap.xml');

  fs.writeFileSync(rootOutPath, rootSitemap, 'utf8');
  fs.writeFileSync(csOutPath, csSitemap, 'utf8');

  console.log(`Generated ${rootOutPath} with ${rootUrls.length} URLs`);
  console.log(`Generated ${csOutPath} with ${csUrls.length} URLs`);
})();

