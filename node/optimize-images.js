// node/optimize-images.js
//
// Canonical responsive-image pipeline for the CzechAlert site.
//
// Walks `media/*.{jpg,jpeg,png}`, and for every source produces a 6×3 matrix
// of variants under `media/optimized/{name}-{width}.{avif|webp|jpg}` that the
// `<picture>` elements in HTML and the `image-set()` declarations in CSS can
// reference deterministically.
//
// Lighthouse audits this targets
// ------------------------------
//   • "Properly size images"            (6 widths, never upscaled)
//   • "Efficiently encode images"       (per-breakpoint byte budget, binary search)
//   • "Serve images in next-gen formats"(AVIF primary, WebP fallback, JPG safety)
//   • "Largest Contentful Paint"        (small bytes at common LCP widths)
//
// Strategy
// --------
// The single biggest lever on LCP is *transferred byte size*. Instead of one
// fixed quality, this script targets a per-breakpoint BYTE BUDGET and runs a
// binary search over the encoder quality to find the HIGHEST quality that
// still fits inside that budget. That keeps visual quality as high as the
// budget allows while guaranteeing a fast LCP.
//
// Usage
// -----
//   node node/optimize-images.js                     # all media/*, skip up-to-date
//   node node/optimize-images.js --force             # rebuild everything
//   node node/optimize-images.js round-nebula-bg.jpg # process named source(s)
//
// Idempotent: outputs whose mtime is newer than the source are skipped unless
// `--force` is passed.

'use strict';

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const projectRoot = process.cwd();
const mediaDir = path.join(projectRoot, 'media');
const outputDir = path.join(mediaDir, 'optimized');

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------

// Responsive widths the `srcset` / `image-set()` in HTML and CSS reference.
// Six steps cover phones (320/640), tablets (960), laptops (1280/1600), and
// large desktops (1920) without over-fetching at any common viewport.
//
// Budgets (KB) are for the *next-gen* formats (AVIF/WebP) which is what
// Lighthouse weighs. JPG fallback gets a modest multiplier below.
const BREAKPOINTS = [
  { width: 320,  maxKB: 12 },   // small phones, low-res cards
  { width: 640,  maxKB: 30 },   // standard phones
  { width: 960,  maxKB: 55 },   // small tablets / 2× phones
  { width: 1280, maxKB: 90 },   // laptops / common LCP width
  { width: 1600, maxKB: 130 },  // large laptops
  { width: 1920, maxKB: 170 },  // full HD desktops
];

const MIN_QUALITY = 45;
const MAX_QUALITY = 82;

const FORMATS = [
  {
    ext: 'avif',
    budgetMultiplier: 1,     // measured format — must respect the budget exactly
    encode: (pipeline, quality) =>
      pipeline.avif({ quality, effort: 6, chromaSubsampling: '4:2:0' }),
  },
  {
    ext: 'webp',
    budgetMultiplier: 1.15,  // WebP is slightly less efficient than AVIF
    encode: (pipeline, quality) =>
      pipeline.webp({ quality, effort: 6, smartSubsample: true }),
  },
  {
    ext: 'jpg',
    budgetMultiplier: 1.6,   // legacy fallback only — modest headroom allowed
    encode: (pipeline, quality) =>
      pipeline.jpeg({ quality, mozjpeg: true, progressive: true }),
  },
];

const ALLOWED_EXTS = new Set(['.jpg', '.jpeg', '.png']);

// Sources never to touch (e.g. the logo or assets handled elsewhere). Keep
// this list narrow — better to optimise something we don't reference than to
// forget a new asset.
const SKIP_FILES = new Set([
  'czech-alert-logo-desktop.png', // small UI logo, served as-is
  '2.png',                        // unused stray
  '4748523.jpg',                  // unused stray
]);

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function formatKB(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function encodeToBuffer(format, basePipeline, quality) {
  return format.encode(basePipeline.clone(), quality).toBuffer();
}

/**
 * Binary-search the encoder quality to find the highest quality whose output
 * still fits inside `budgetBytes`. If even MIN_QUALITY overflows the budget we
 * keep the MIN_QUALITY result (the floor wins over the budget — we never ship
 * a mushy image just to save a few KB).
 *
 * @returns {Promise<{buffer: Buffer, quality: number, withinBudget: boolean}>}
 */
async function findBestQualityUnderBudget(format, basePipeline, budgetBytes) {
  let low = MIN_QUALITY;
  let high = MAX_QUALITY;
  let best = null;
  let smallest = null;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const buffer = await encodeToBuffer(format, basePipeline, mid);

    if (smallest === null || buffer.length < smallest.buffer.length) {
      smallest = { buffer, quality: mid };
    }

    if (buffer.length <= budgetBytes) {
      best = { buffer, quality: mid };
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (best) return { ...best, withinBudget: true };
  return { ...smallest, withinBudget: false };
}

/** Resolve a CLI-supplied name to an absolute source path inside /media. */
function resolveInputPath(name) {
  const candidates = [
    path.resolve(projectRoot, name),
    path.join(mediaDir, name),
  ];
  return candidates.find((p) => fs.existsSync(p) && fs.statSync(p).isFile()) || null;
}

/** True when every (width × format) output is newer than the source. */
function allOutputsFresh(inputPath, baseName, widths) {
  const srcMtime = fs.statSync(inputPath).mtimeMs;
  for (const w of widths) {
    for (const f of FORMATS) {
      const outPath = path.join(outputDir, `${baseName}-${w}.${f.ext}`);
      if (!fs.existsSync(outPath)) return false;
      if (fs.statSync(outPath).mtimeMs < srcMtime) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

(async () => {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const namedSources = args.filter((a) => !a.startsWith('--'));

  if (!fs.existsSync(mediaDir) || !fs.statSync(mediaDir).isDirectory()) {
    console.error(`❌ Media directory not found at: ${mediaDir}`);
    process.exit(1);
  }
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Build the work list. CLI-named sources take precedence; otherwise auto-scan.
  let inputs = [];
  if (namedSources.length > 0) {
    for (const name of namedSources) {
      const ext = path.extname(name).toLowerCase();
      if (!ALLOWED_EXTS.has(ext)) {
        console.warn(`⚠️  Skipping "${name}" — unsupported extension "${ext}".`);
        continue;
      }
      const resolved = resolveInputPath(name);
      if (!resolved) {
        console.error(`❌ Could not find image: "${name}"`);
        continue;
      }
      inputs.push(resolved);
    }
  } else {
    const entries = fs.readdirSync(mediaDir, { withFileTypes: true });
    inputs = entries
      .filter((e) => e.isFile())
      .map((e) => e.name)
      .filter((n) => ALLOWED_EXTS.has(path.extname(n).toLowerCase()))
      .filter((n) => !SKIP_FILES.has(n))
      .map((n) => path.join(mediaDir, n));
  }

  if (inputs.length === 0) {
    console.error('❌ No images to process.');
    process.exit(1);
  }

  let processed = 0;
  let skipped = 0;
  let warnings = 0;

  for (const inputPath of inputs) {
    const baseName = path.basename(inputPath, path.extname(inputPath));
    const meta = await sharp(inputPath).metadata();
    const originalBytes = fs.statSync(inputPath).size;

    // Filter widths once: never upscale past the source's native width. If the
    // source is 1100 px wide we still build 320/640/960 and a single 1100-wide
    // top variant rather than three identical 1100-wide files at 1280/1600/1920.
    const widthsForThisSource = (() => {
      if (!meta.width) return BREAKPOINTS.map((b) => b.width);
      const native = meta.width;
      const out = [];
      for (const b of BREAKPOINTS) {
        if (b.width < native) {
          out.push(b.width);
        } else {
          // Add a single top variant at the native width and stop.
          if (!out.includes(native)) out.push(native);
          break;
        }
      }
      return out;
    })();

    if (!force && allOutputsFresh(inputPath, baseName, widthsForThisSource)) {
      console.log(`⏭  ${path.basename(inputPath)} up-to-date — skipped`);
      skipped++;
      continue;
    }

    console.log(
      `\n🖼  ${path.basename(inputPath)}  (${meta.width}×${meta.height}, ${formatKB(originalBytes)})`,
    );

    for (const targetWidth of widthsForThisSource) {
      // Find the matching budget — for the synthesized native-width variant
      // (e.g. 1100) fall through to the largest defined budget.
      const breakpoint =
        BREAKPOINTS.find((b) => b.width === targetWidth) ||
        BREAKPOINTS[BREAKPOINTS.length - 1];

      const basePipeline = sharp(inputPath).resize({
        width: targetWidth,
        withoutEnlargement: true,
        fit: 'inside',
      });

      for (const format of FORMATS) {
        const budgetBytes = breakpoint.maxKB * 1024 * format.budgetMultiplier;
        const result = await findBestQualityUnderBudget(format, basePipeline, budgetBytes);

        const outName = `${baseName}-${targetWidth}.${format.ext}`;
        const outPath = path.join(outputDir, outName);
        await fs.promises.writeFile(outPath, result.buffer);

        const status = result.withinBudget ? '✔' : '⚠';
        const note = result.withinBudget
          ? ''
          : ` (over budget at min quality ${MIN_QUALITY})`;
        if (!result.withinBudget) warnings++;

        console.log(
          `   ${status} ${outName.padEnd(48)} q${String(result.quality).padStart(2)}  ${formatKB(result.buffer.length)}${note}`,
        );
      }
    }
    processed++;
  }

  console.log(
    `\n✅ Done. processed=${processed}, skipped=${skipped}, warnings=${warnings}.`,
  );
  console.log(`   Outputs in ${path.relative(projectRoot, outputDir)}/`);
})().catch((err) => {
  console.error('\n❌ Image optimisation failed:', err);
  process.exit(1);
});
