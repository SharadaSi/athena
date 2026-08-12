#!/usr/bin/env node
/**
 * One-off cleanup: remove em-dashes, en-dashes and hyphen-as-dash from
 * user-visible HTML text. Preserves HTML comments, <script>/<style> blocks,
 * tag attributes (except meta description + form value where dash is visible),
 * URLs, and class names.
 *
 * Substitutions:
 *   • em-dash "—"        → ","
 *   • en-dash "–"        → ","  (or " to " / " až " when between digits)
 *   • " - " (ASCII)      → ","  (only when clearly used as a dash in prose)
 *   • digit–digit range  → "digit to digit" (EN) / "digit až digit" (CS)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Every HTML page that renders content. Skips node_modules, studio, vendor.
const FILES = [
    'business-intelligence.html',
    'contact.html',
    'czechalert-gives-guest-lecture-at-czu.html',
    'data-banks-how-institutions-slowly-chip-away-at-your-privacy.html',
    'index.html',
    'newsletter.html',
    'pr-and-media.html',
    'private-intelligence-and-security.html',
    'publications.html',
    'public-interest-work.html',
    'the-end-of-chat-control.html',
    'the-true-value-of-your-data.html',
    'article.html',
    'unused.html',
    'cs/article.html',
    'cs/business-intelligence.html',
    'cs/contact.html',
    'cs/czechalert-gives-guest-lecture-at-czu.html',
    'cs/data-banks-how-institutions-slowly-chip-away-at-your-privacy.html',
    'cs/index.html',
    'cs/newsletter.html',
    'cs/pr-and-media.html',
    'cs/private-intelligence-and-security.html',
    'cs/publications.html',
    'cs/the-end-of-chat-control.html',
    'cs/the-true-value-of-your-data.html',
];

/**
 * Apply dash substitutions to a single text fragment.
 * @param {string} txt  raw text (already URL/tag-safe)
 * @param {boolean} cz  true for Czech pages (uses "až" for ranges)
 */
function fixDashes(txt, cz) {
    const rangeWord = cz ? 'až' : 'to';

    // 1. Numeric ranges first, before generic dash rules eat them.
    txt = txt.replace(/(\d)\s*–\s*(\d)/g, `$1 ${rangeWord} $2`);
    txt = txt.replace(/(\d) - (\d)/g, `$1 ${rangeWord} $2`);

    // 2. Em-dash and en-dash as punctuation.
    //    Collapse the surrounding spaces so we never emit " , ".
    txt = txt.replace(/\s*—\s*/g, ', ');
    txt = txt.replace(/\s*–\s*/g, ', ');

    // 3. ASCII hyphen used as a dash: only when flanked by spaces.
    //    Never touches hyphenated words ("co-founder", "e-mail").
    txt = txt.replace(/ - /g, ', ');

    return txt;
}

/**
 * Process one HTML file.
 */
function processFile(relPath) {
    const abs = path.join(ROOT, relPath);
    const cz = relPath.startsWith('cs/') || relPath.startsWith('cs\\');
    const original = fs.readFileSync(abs, 'utf8');

    // Protect segments we must not touch: HTML comments, script/style bodies.
    const stash = [];
    const stashPush = (m) => {
        stash.push(m);
        return `\u0000STASH${stash.length - 1}\u0000`;
    };

    let s = original;
    s = s.replace(/<!--[\s\S]*?-->/g, stashPush);
    s = s.replace(/<script\b[\s\S]*?<\/script>/gi, stashPush);
    s = s.replace(/<style\b[\s\S]*?<\/style>/gi, stashPush);

    // (a) Text nodes: anything between a `>` and the next `<`.
    s = s.replace(/>([^<]+)</g, (_m, txt) => '>' + fixDashes(txt, cz) + '<');

    // (b) Meta description content attribute (user-visible in SERPs / socials).
    //     Uses a backreference for the quote so apostrophes inside the text
    //     (e.g. "Denmark's") don't prematurely terminate the match.
    s = s.replace(
        /(<meta\b[^>]*\b(?:name|property)\s*=\s*["'](?:description|og:description|twitter:description)["'][^>]*\bcontent\s*=\s*)(["'])([\s\S]*?)\2/gi,
        (_m, pre, q, txt) => pre + q + fixDashes(txt, cz) + q
    );

    // (c) Form input value attribute (visible label chosen by user).
    s = s.replace(
        /(\bvalue\s*=\s*)(["'])([^"']*(?:—|–| - |\d\s*–\s*\d)[^"']*)\2/g,
        (_m, pre, q, txt) => pre + q + fixDashes(txt, cz) + q
    );

    // Restore protected segments.
    s = s.replace(/\u0000STASH(\d+)\u0000/g, (_m, i) => stash[+i]);

    if (s !== original) {
        fs.writeFileSync(abs, s, 'utf8');
        return true;
    }
    return false;
}

let changed = 0;
for (const rel of FILES) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
        console.warn(`skip (missing): ${rel}`);
        continue;
    }
    if (processFile(rel)) {
        console.log(`updated: ${rel}`);
        changed++;
    } else {
        console.log(`unchanged: ${rel}`);
    }
}
console.log(`\nDone. Files updated: ${changed}/${FILES.length}`);
