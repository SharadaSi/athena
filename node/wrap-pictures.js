// node/wrap-pictures.js
//
// One-shot HTML migration: upgrades every static `<img>` that points to a
// local raster (`media/*.{jpg,jpeg,png}`) into the iOS-friendly shape we
// settled on for the responsive image rollout.
//
// For each `<img src="...media/{name}.{jpg|jpeg|png}">`:
//
//   1. If `media/optimized/{name}-{w}.{avif|webp|jpg}` exists for at least
//      two of our breakpoint widths, the tag is rewritten as a `<picture>`
//      element with `<source type="image/avif">`, `<source type="image/webp">`,
//      and a JPG `<img>` fallback. `srcset` carries every available width.
//   2. Otherwise the original `<img>` is preserved but augmented with
//      `loading="lazy"` + `decoding="async"` and (when the original asset can
//      be probed via Sharp) explicit `width`/`height` to kill CLS.
//
// Special cases:
//
//   • Nav logos (`class*="nav--logo-img"`) keep their eager default but
//     receive `decoding="async"`.
//   • Footer logos (`class*="footer--logo-img"`) get
//     `loading="lazy"` + `fetchpriority="low"` + `decoding="async"`.
//   • Images already wrapped in a `<picture>` (or already carrying
//     `loading="..."`) are left alone, so the migration is idempotent.
//   • SVG icons are skipped — the file is already tiny.
//
// Run:   node node/wrap-pictures.js
//
// Prereq: run `node node/optimize-images.js` first so the optimized variants
// exist on disk.

'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const projectRoot = process.cwd();
const mediaDir = path.join(projectRoot, 'media');
const optimizedDir = path.join(mediaDir, 'optimized');

// Breakpoint widths we generate locally. Must match node/optimize-images.js.
const CANONICAL_WIDTHS = [320, 640, 960, 1280, 1600, 1920];

// Per-context `sizes` clause. Determined by the CSS class on the `<img>` (or
// its enclosing wrapper) so the browser can pick a sensibly-sized variant
// from the `srcset`. Keep this list aligned with the SCSS layout.
//
// Last match wins, so put the most specific selectors at the bottom.
const SIZES_RULES = [
    { match: /\bblog-img\b/,                          sizes: '(min-width: 64rem) 50vw, 100vw' },
    { match: /\barticle-page--content-img\b/,         sizes: '(min-width: 64rem) 70vw, 100vw' },
    { match: /\barticle-preview-img\b/,               sizes: '(min-width: 64rem) 33vw, 90vw' },
    { match: /\bmain-article-preview-img\b/,          sizes: '(min-width: 64rem) 60vw, 100vw' },
    { match: /\bservices__cell--anchor\b/,            sizes: '(min-width: 64rem) 40vw, 90vw' },
    // Generic content image inside an article body
    { match: /\barticle-page--inline-image\b/,        sizes: '(min-width: 50rem) 800px, 100vw' },
];

const DEFAULT_SIZES = '(min-width: 64rem) 60vw, 100vw';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function listHtml(dir) {
    return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isFile() && d.name.endsWith('.html'))
        .map((d) => path.join(dir, d.name));
}

function hasAttr(tag, name) {
    return new RegExp(`\\s${name}\\s*=`, 'i').test(tag);
}

function getAttr(tag, name) {
    const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, 'i'));
    return m ? m[1] : null;
}

/** Strip the leading `./`, `../`, or any path prefix and return the basename
 *  (without extension) for a media-relative src. */
function srcToBasename(src) {
    const cleaned = src.replace(/^\.{0,2}\//, '');
    const name = path.basename(cleaned);
    return name.replace(path.extname(name), '');
}

/** True for a relative path that lives somewhere under `media/`. */
function isLocalMediaSrc(src) {
    return /(^|\/)media\//.test(src) && !src.startsWith('http');
}

/** Compute how many `../` segments are needed for this HTML file to reach
 *  `media/optimized/`. Root pages need `media/optimized`, `cs/` pages need
 *  `../media/optimized`. */
function relativeMediaPrefix(htmlFile) {
    const rel = path.relative(path.dirname(htmlFile), mediaDir);
    return rel.split(path.sep).join('/');
}

/** Discover which (width × format) variants exist on disk for a given base. */
function discoverVariants(baseName) {
    const widths = { avif: [], webp: [], jpg: [] };
    for (const w of CANONICAL_WIDTHS) {
        for (const ext of ['avif', 'webp', 'jpg']) {
            const p = path.join(optimizedDir, `${baseName}-${w}.${ext}`);
            if (fs.existsSync(p)) widths[ext].push(w);
        }
    }
    return widths;
}

/** Probe the original source for intrinsic dimensions (used to set
 *  `width`/`height` on the fallback `<img>` to kill CLS). */
const dimsCache = new Map();
async function probeDims(absPath) {
    if (dimsCache.has(absPath)) return dimsCache.get(absPath);
    try {
        const meta = await sharp(absPath).metadata();
        const dims = { width: meta.width || null, height: meta.height || null };
        dimsCache.set(absPath, dims);
        return dims;
    } catch {
        dimsCache.set(absPath, null);
        return null;
    }
}

function pickSizes(tag) {
    for (const rule of SIZES_RULES) {
        if (rule.match.test(tag)) return rule.sizes;
    }
    return DEFAULT_SIZES;
}

/** Preserve any attributes from the source `<img>` we care about: id, class,
 *  alt, title, style. Used when reconstructing the fallback `<img>` inside a
 *  new `<picture>`. */
function carryAttrs(srcTag) {
    const carry = {};
    for (const name of ['id', 'class', 'alt', 'title', 'style']) {
        const v = getAttr(srcTag, name);
        if (v !== null) carry[name] = v;
    }
    return carry;
}

function renderAttrs(map) {
    return Object.entries(map)
        .map(([k, v]) => `${k}="${v.replace(/"/g, '&quot;')}"`)
        .join(' ');
}

function buildSrcset(prefix, baseName, widths, ext) {
    return widths
        .map((w) => `${prefix}/optimized/${baseName}-${w}.${ext} ${w}w`)
        .join(', ');
}

// ---------------------------------------------------------------------------
// Per-tag transformation
// ---------------------------------------------------------------------------

async function transformImgTag(tag, htmlFile) {
    if (!/^<img\b/i.test(tag)) return tag;

    // Idempotency: if this <img> already has loading="..." we treat it as
    // already-migrated and leave it alone.
    if (hasAttr(tag, 'loading') || hasAttr(tag, 'srcset')) return tag;

    const src = getAttr(tag, 'src') || '';
    const cls = getAttr(tag, 'class') || '';

    // Logo special cases
    if (/footer--logo-img/.test(cls)) {
        return appendAttrs(tag, [
            'loading="lazy"',
            'decoding="async"',
            'fetchpriority="low"',
        ]);
    }
    if (/nav--logo-img/.test(cls)) {
        // Stays eager (default) — just opt into async decoding.
        return appendAttrs(tag, ['decoding="async"']);
    }

    // Skip SVG icons and tags with empty src (article hero is hydrated by JS).
    if (!src || /\.svg($|\?)/i.test(src)) {
        return tag;
    }

    // Only handle local raster media. External (Sanity) URLs are owned by JS.
    if (!isLocalMediaSrc(src) || !/\.(jpe?g|png)$/i.test(src)) {
        return appendAttrs(tag, ['loading="lazy"', 'decoding="async"']);
    }

    const baseName = srcToBasename(src);
    const variants = discoverVariants(baseName);

    // Resolve the original source file on disk so we can probe dims.
    const origAbs = path.resolve(path.dirname(htmlFile), src);
    const dims = await probeDims(origAbs);

    // Decide whether we have enough variants to upgrade to <picture>. We need
    // at least two widths in BOTH avif and webp to make the responsive
    // negotiation worthwhile.
    const haveAvif = variants.avif.length >= 2;
    const haveWebp = variants.webp.length >= 2;
    const haveJpg = variants.jpg.length >= 1;

    if (!haveAvif && !haveWebp) {
        // Nothing to upgrade to — just add the iOS-safe attributes.
        return appendAttrs(tag, withDims(['loading="lazy"', 'decoding="async"'], dims));
    }

    const sizes = pickSizes(tag);
    const prefix = relativeMediaPrefix(htmlFile);
    const attrs = carryAttrs(tag);

    // Compose fallback <img>. Falls back to JPG when available, original src otherwise.
    const fallbackWidth = haveJpg
        ? variants.jpg[variants.jpg.length - 1]
        : null;
    const fallbackSrc = fallbackWidth
        ? `${prefix}/optimized/${baseName}-${fallbackWidth}.jpg`
        : src;

    const fallbackImgAttrs = {
        ...attrs,
        src: fallbackSrc,
        loading: 'lazy',
        decoding: 'async',
    };
    if (haveJpg) {
        fallbackImgAttrs.srcset = buildSrcset(prefix, baseName, variants.jpg, 'jpg');
        fallbackImgAttrs.sizes = sizes;
    }
    if (dims && dims.width && dims.height) {
        fallbackImgAttrs.width = String(dims.width);
        fallbackImgAttrs.height = String(dims.height);
    }

    const sources = [];
    if (haveAvif) {
        sources.push(
            `    <source type="image/avif" srcset="${buildSrcset(prefix, baseName, variants.avif, 'avif')}" sizes="${sizes}">`,
        );
    }
    if (haveWebp) {
        sources.push(
            `    <source type="image/webp" srcset="${buildSrcset(prefix, baseName, variants.webp, 'webp')}" sizes="${sizes}">`,
        );
    }

    return [
        '<picture>',
        ...sources,
        `    <img ${renderAttrs(fallbackImgAttrs)}>`,
        '</picture>',
    ].join('\n');
}

/** Add a set of attribute strings just before the closing `>` of an `<img>` tag. */
function appendAttrs(tag, attrStrings) {
    if (attrStrings.length === 0) return tag;
    return tag.replace(/\s*\/?>$/, (close) => ` ${attrStrings.join(' ')}${close}`);
}

function withDims(attrs, dims) {
    if (dims && dims.width && dims.height) {
        attrs.push(`width="${dims.width}"`, `height="${dims.height}"`);
    }
    return attrs;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function processFile(file) {
    const src = fs.readFileSync(file, 'utf8');

    // Skip files that are already inside <picture>; we won't double-wrap.
    // We collect every <img ...> token (greedy `[\s\S]*?` to tolerate
    // multi-line tags) and rewrite each in place, but only when not already
    // wrapped.
    let out = '';
    let lastIndex = 0;
    const rx = /<img\b[\s\S]*?>/gi;
    let m;
    while ((m = rx.exec(src)) !== null) {
        const tag = m[0];
        const before = src.slice(lastIndex, m.index);
        out += before;

        // Detect if this <img> is already inside a <picture>: look back over
        // the last ~200 chars of `before` for an unmatched <picture>. Cheap
        // heuristic — false positives mean we miss a re-wrap, not corruption.
        const ctx = (out.slice(-400) || '').toLowerCase();
        const openPic = ctx.lastIndexOf('<picture');
        const closePic = ctx.lastIndexOf('</picture');
        const insidePicture = openPic > closePic;

        out += insidePicture ? tag : await transformImgTag(tag, file);
        lastIndex = m.index + tag.length;
    }
    out += src.slice(lastIndex);

    if (out === src) return false;
    fs.writeFileSync(file, out, 'utf8');
    return true;
}

(async () => {
    const dirs = [projectRoot, path.join(projectRoot, 'cs')];
    let scanned = 0;
    let changed = 0;

    for (const dir of dirs) {
        if (!fs.existsSync(dir)) continue;
        for (const file of listHtml(dir)) {
            scanned++;
            const didChange = await processFile(file);
            if (didChange) {
                changed++;
                console.log('updated', path.relative(projectRoot, file));
            }
        }
    }
    console.log(`\nDone. scanned=${scanned}, updated=${changed}.`);
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
