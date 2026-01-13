#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const EXCLUDE_DIRS = new Set([
  'cs\\Hostinger - CzechALert',
  'Hostinger - CzechALert',
  'studio-czechalert-website',
  'node',
  'sass',
  'media',
  'media-bez-komprese',
  'icons',
  'js',
  'css',
  'tools'
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

const files = walk(ROOT).filter(p => {
  // Include English root and Czech cs/ articles and pages, exclude duplicates in Hostinger copies
  const rel = path.relative(ROOT, p).replace(/\\/g, '/');
  if (rel.startsWith('Hostinger - CzechALert/')) return false;
  return true;
});

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

const sitemap = header + body + footer;
const outPath = path.join(ROOT, 'sitemap.xml');
fs.writeFileSync(outPath, sitemap, 'utf8');
console.log(`Generated ${outPath} with ${urls.length} URLs`);
