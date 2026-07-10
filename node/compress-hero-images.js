// node/compress-hero-images.js
//
// Compresses hero / Largest-Contentful-Paint (LCP) images so they comply with
// Google Lighthouse audits — specifically:
//   • "Largest Contentful Paint"        (a smaller hero byte-weight => faster LCP)
//   • "Properly size images"            (responsive widths, no oversized delivery)
//   • "Efficiently encode images"       (AVIF/WebP at tuned quality)
//   • "Serve images in next-gen formats"(AVIF first, WebP fallback, JPG safety net)
//
// Strategy
// --------
// The single biggest lever on LCP is the *transferred byte size* of the hero
// image. So instead of using one fixed quality value, this script targets a
// per-breakpoint BYTE BUDGET and runs a binary search over the encoder quality
// to find the HIGHEST quality that still fits inside that budget. That keeps the
// visual quality as high as the budget allows while guaranteeing a fast LCP.
//
// Usage
// -----
//   node node/compress-hero-images.js                       (processes HERO_IMAGES below)
//   node node/compress-hero-images.js round-nebula-bg.jpg   (process specific file[s])
//   node node/compress-hero-images.js media/round-nebula-bg.jpg another.png
//
// Output: media/hero-optimized/<name>-<width>.<avif|webp|jpg>

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const projectRoot = process.cwd();
const mediaDir = path.join(projectRoot, 'media');
const outputDir = path.join(mediaDir, 'hero-optimized');

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------

// Default hero images to optimise when no CLI arguments are passed.
// Adjust this list to match the actual LCP image(s) on your pages.
const HERO_IMAGES = [
  'round-nebula-bg.jpg',
  'abstract-network-background.png',
];

// Responsive breakpoints. Each width gets its own byte budget.
//
// Budget rationale: Lighthouse rewards a hero that downloads quickly. On the
// largest desktop variant we keep the AVIF/WebP under ~150 KB, which on a
// typical "Slow 4G" Lighthouse throttle profile downloads well within the LCP
// budget. Smaller breakpoints get proportionally smaller budgets so mobile —
// where Lighthouse scores are hardest — stays fast.
//
// maxKB is the target ceiling for the *next-gen* formats (AVIF/WebP). The JPG
// fallback is allowed a little more headroom since it is only served to legacy
// browsers and is not the format Lighthouse measures on modern engines.
const BREAKPOINTS = [
  { width: 640,  maxKB: 45 },   // mobile
  { width: 1024, maxKB: 85 },   // tablet
  { width: 1600, maxKB: 130 },  // laptop / common LCP width
  { width: 1920, maxKB: 170 },  // large desktop
];

// Quality search bounds. We never drop below MIN_QUALITY (to protect quality)
// nor above MAX_QUALITY (above this the byte cost is rarely worth it for heroes).
const MIN_QUALITY = 45;
const MAX_QUALITY = 82;

// Per-format encoder factory + a JPG headroom multiplier for the fallback.
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

const ALLOWED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

/**
 * Resolve a CLI-supplied or default image name to an absolute path inside the
 * project. Accepts bare filenames (looked up in /media) or relative paths.
 * @param {string} name
 * @returns {string|null} absolute path, or null if it cannot be found
 */
function resolveInputPath(name) {
  const candidates = [
    path.resolve(projectRoot, name),         // relative/absolute path as given
    path.join(mediaDir, name),               // bare filename inside /media
  ];
  return candidates.find(p => fs.existsSync(p) && fs.statSync(p).isFile()) || null;
}

/**
 * Encode a resized pipeline at a given quality and return the resulting buffer.
 * A fresh clone is used so the underlying pipeline is never mutated/consumed.
 * @returns {Promise<Buffer>}
 */
function encodeToBuffer(format, basePipeline, quality) {
  return format.encode(basePipeline.clone(), quality).toBuffer();
}

/**
 * Binary-search the encoder quality to find the highest quality whose output
 * still fits inside `budgetBytes`. If even MIN_QUALITY overflows the budget we
 * keep the MIN_QUALITY result (quality floor wins over the budget — we never
 * ship a mushy hero just to save a few KB).
 *
 * @returns {Promise<{buffer: Buffer, quality: number, withinBudget: boolean}>}
 */
async function findBestQualityUnderBudget(format, basePipeline, budgetBytes) {
  let low = MIN_QUALITY;
  let high = MAX_QUALITY;

  // Best candidate that fits the budget so far.
  let best = null;
  // Always-available fallback: the smallest encode we produced (MIN_QUALITY).
  let smallest = null;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const buffer = await encodeToBuffer(format, basePipeline, mid);

    if (smallest === null || buffer.length < smallest.buffer.length) {
      smallest = { buffer, quality: mid };
    }

    if (buffer.length <= budgetBytes) {
      // Fits — record it and try to push quality higher.
      best = { buffer, quality: mid };
      low = mid + 1;
    } else {
      // Too big — reduce quality.
      high = mid - 1;
    }
  }

  if (best) {
    return { ...best, withinBudget: true };
  }
  // Nothing fit the budget: honour the quality floor instead of going lower.
  return { ...smallest, withinBudget: false };
}

function formatKB(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

(async () => {
  // Resolve the work list: CLI args take precedence over the default HERO list.
  const requested = process.argv.slice(2);
  const names = requested.length > 0 ? requested : HERO_IMAGES;

  const inputs = [];
  for (const name of names) {
    const ext = path.extname(name).toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) {
      console.warn(`⚠️  Skipping "${name}" — unsupported extension "${ext}".`);
      continue;
    }
    const resolved = resolveInputPath(name);
    if (!resolved) {
      console.error(`❌ Could not find image: "${name}" (looked in /media and as a relative path).`);
      continue;
    }
    inputs.push(resolved);
  }

  if (inputs.length === 0) {
    console.error('❌ No valid hero images to process. Pass filenames as arguments or edit HERO_IMAGES.');
    process.exit(1);
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (const inputPath of inputs) {
    const baseName = path.basename(inputPath, path.extname(inputPath));
    const meta = await sharp(inputPath).metadata();
    const originalBytes = fs.statSync(inputPath).size;

    console.log(`\n🖼  ${path.basename(inputPath)}  (${meta.width}×${meta.height}, ${formatKB(originalBytes)})`);

    for (const { width, maxKB } of BREAKPOINTS) {
      // Never upscale: cap the breakpoint width at the source width.
      const targetWidth = meta.width ? Math.min(width, meta.width) : width;

      // Build the shared resize pipeline once per breakpoint. We strip metadata
      // (EXIF/ICC bloat) which also trims bytes. withoutEnlargement guards the
      // no-upscale rule even if the source is smaller than the breakpoint.
      const basePipeline = sharp(inputPath).resize({
        width: targetWidth,
        withoutEnlargement: true,
        fit: 'inside',
      });

      for (const format of FORMATS) {
        const budgetBytes = maxKB * 1024 * format.budgetMultiplier;
        const result = await findBestQualityUnderBudget(format, basePipeline, budgetBytes);

        const outName = `${baseName}-${targetWidth}.${format.ext}`;
        const outPath = path.join(outputDir, outName);
        await fs.promises.writeFile(outPath, result.buffer);

        const status = result.withinBudget ? '✔' : '⚠';
        const note = result.withinBudget
          ? ''
          : ` (over budget at min quality ${MIN_QUALITY} — consider a smaller source crop)`;

        console.log(
          `   ${status} ${outName.padEnd(42)} q${String(result.quality).padStart(2)}  ${formatKB(result.buffer.length)}${note}`,
        );
      }
    }
  }

  console.log(`\n✅ Done. Optimised hero images written to ${path.relative(projectRoot, outputDir)}/`);
  console.log('   Wire them up with a <picture> element: AVIF → WebP → JPG, using srcset/sizes for the breakpoints.');
})().catch(err => {
  console.error('\n❌ Hero compression failed:', err);
  process.exit(1);
});
