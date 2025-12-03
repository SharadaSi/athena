// convert-media.js
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const projectRoot = process.cwd();
const mediaDir = path.join(projectRoot, 'media');
const outputDir = path.join(mediaDir, 'converted-img');

// Create output directory if needed
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Target sizes and formats
const sizes = [320, 640, 1280];
const formats = [
  { ext: 'avif', fn: img => img.avif({ quality: 85 }) },
  { ext: 'webp', fn: img => img.webp({ quality: 85 }) },
  { ext: 'jpg',  fn: img => img.jpeg({ quality: 85 }) },
];

// Which source file extensions to process
const ALLOWED_EXTS = new Set(['.jpg', '.jpeg', '.png']);

(async () => {
  // Verify media directory exists
  if (!fs.existsSync(mediaDir) || !fs.statSync(mediaDir).isDirectory()) {
    console.error(`❌ Media directory not found at: ${mediaDir}`);
    process.exit(1);
  }

  // Collect input files (skip the converted output folder)
  const entries = fs.readdirSync(mediaDir, { withFileTypes: true });
  const inputFiles = entries
    .filter(e => e.isFile())
    .map(e => e.name)
    .filter(name => {
      const ext = path.extname(name).toLowerCase();
      return ALLOWED_EXTS.has(ext);
    });

  if (inputFiles.length === 0) {
    console.warn('⚠️ No source images found in /media (accepted: .jpg, .jpeg, .png)');
    process.exit(0);
  }

  for (const file of inputFiles) {
    const inputPath = path.join(mediaDir, file);
    const baseName = path.basename(file, path.extname(file));

    for (const size of sizes) {
      // Build a fresh pipeline per size to avoid mutations
      const resized = sharp(inputPath).resize(size);

      for (const { ext, fn } of formats) {
        const outName = `${baseName}-${size}.${ext}`;
        const outPath = path.join(outputDir, outName);

        try {
          await fn(resized.clone()).toFile(outPath);
          console.log(`✔ Created: ${path.relative(projectRoot, outPath)}`);
        } catch (err) {
          console.error(`❌ Failed for ${file} @ ${size}px as .${ext}:`, err.message);
        }
      }
    }
  }

  console.log('✅ Done. Converted images are in /media/converted-img');
})().catch(err => {
  console.error(err);
  process.exit(1);
});