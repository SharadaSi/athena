# The No-Framework Manual for Fast Images & Video

A practical, plain-English guide for building **image- and video-heavy websites**
that still load fast and score well on Lighthouse — written for a junior
front-end developer who works with **plain HTML, CSS, and JavaScript** (no React,
no Vue, no build framework).

The golden rule of media performance:

> **Send the smallest file that still looks good, in the most modern format the
> browser supports, at the moment it is actually needed — and never let it push
> the page around while it loads.**

Everything below is just that one sentence, broken into pieces you can act on.

---

## Table of contents

1. [Why media is the #1 performance problem](#1-why-media-is-the-1-performance-problem)
2. [The vocabulary you need first](#2-the-vocabulary-you-need-first)
3. [Image formats: which one, and why](#3-image-formats-which-one-and-why)
4. [Resolution: stop shipping 6000px photos](#4-resolution-stop-shipping-6000px-photos)
5. [Responsive images: `srcset`, `sizes`, and `<picture>`](#5-responsive-images-srcset-sizes-and-picture)
6. [Lazy loading vs. eager loading (and the LCP trap)](#6-lazy-loading-vs-eager-loading-and-the-lcp-trap)
7. [Preventing layout shift (CLS)](#7-preventing-layout-shift-cls)
8. [Background images in CSS](#8-background-images-in-css)
9. [Video: the heavyweight](#9-video-the-heavyweight)
10. [Hero / background video, the right way](#10-hero--background-video-the-right-way)
11. [The build pipeline: automate it](#11-the-build-pipeline-automate-it)
12. [Measuring: Lighthouse & friends](#12-measuring-lighthouse--friends)
13. [Quick copy-paste reference](#13-quick-copy-paste-reference)
14. [Pre-launch checklist](#14-pre-launch-checklist)

---

## 1. Why media is the #1 performance problem

Open almost any slow website, look at the network panel, and sort by size. The
top of the list is almost always images and video. A single un-optimized hero
photo can be **5 MB** — that's larger than all your HTML, CSS, and JavaScript
combined, often by 10×.

**The mental model:** the browser is a delivery truck and the user's connection
is the road. Your job is to put the smallest possible boxes on the truck. It
doesn't matter how clean your code is if you load a 4000×3000 JPEG into a
400px-wide slot — you just shipped a wardrobe to deliver a pair of socks.

Three things determine how heavy a single image is:

| Factor | What it means | Your lever |
|--------|---------------|------------|
| **Format** | The compression algorithm (JPEG, WebP, AVIF…) | Use a modern format |
| **Dimensions** | How many pixels wide × tall | Don't ship more than displayed |
| **Quality** | How aggressively it's compressed | Tune the quality number |

Get those three right and you've solved 90% of media performance. The rest of
this manual is the details.

---

## 2. The vocabulary you need first

You'll see these words everywhere. Learn them once.

- **LCP (Largest Contentful Paint)** — the time until the biggest thing on
  screen (usually your hero image or heading) is painted. Google grades it.
  **Target: under 2.5 seconds.** Your hero media is almost always the LCP
  element, which is why it gets special treatment.
- **CLS (Cumulative Layout Shift)** — how much stuff jumps around while the page
  loads. An image that loads with no reserved space shoves the text down → bad
  CLS. **Target: under 0.1.**
- **Viewport** — the visible part of the page. "Above the fold" = visible without
  scrolling. "Below the fold" = you have to scroll to see it.
- **DPR (Device Pixel Ratio)** — how many physical screen pixels fit in one CSS
  pixel. A normal monitor is 1. A modern phone or Retina Mac is 2 or 3. That's
  why a 400px-wide image slot on a phone may actually need an 800px image to look
  sharp.
- **Intrinsic size** — the image's real pixel dimensions (e.g. 1600×900).
- **Rendered size** — how big it appears on screen (e.g. 400×225 CSS pixels).

---

## 3. Image formats: which one, and why

Think of formats as generations of compression technology. Newer = smaller files
for the same visual quality.

| Format | Best for | Rough size vs JPEG | Browser support (2026) |
|--------|----------|--------------------|------------------------|
| **AVIF** | Photos, gradients, hero images | **~50% smaller** | All modern browsers |
| **WebP** | Photos, the safe modern default | **~30% smaller** | Universal |
| **JPEG** | The fallback everyone can read | baseline | Everywhere |
| **PNG** | Sharp edges, transparency, logos, screenshots | varies | Everywhere |
| **SVG** | Logos, icons, anything geometric | tiny | Everywhere |

### The decision tree

```
Is it a logo, icon, or simple shape?  ──► Use SVG (it's text, scales infinitely, microscopic)
Does it need hard edges or transparency (UI screenshot)?  ──► PNG
Is it a photo or rich image?  ──► AVIF first, WebP fallback, JPEG last resort
```

### Why you serve three formats, not one

AVIF is the smallest, but you can't *only* ship AVIF — an old browser that can't
read it would show a broken image. So you provide a **fallback chain**: "Use AVIF
if you can; if not, WebP; if not even that, JPEG." The browser automatically
picks the first one it understands. You'll see exactly how in section 5.

> **Rule of thumb:** every real photograph on your site should exist as
> `name.avif`, `name.webp`, and `name.jpg`. Logos and icons should be SVG.

---

## 4. Resolution: stop shipping 6000px photos

This is the single most common junior mistake: dragging the original camera file
straight into the page. A phone photo is often 4000–6000px wide. Your layout
displays it at maybe 600px. You just sent **100× more pixels than needed**
(pixel count is width × height, so it squares).

### How many sizes do I need?

You don't make one size — you make a **ladder** of sizes and let the browser pick.
A solid, reusable ladder:

```
320, 640, 960, 1280, 1600, 1920
```

(widths in pixels). 320 covers small phones; 1920 covers full-width desktop
heroes on Retina screens. You rarely need anything above 1920 for the web.

**Don't upscale.** If your source is only 1000px wide, the biggest variant should
be 1000px — making it bigger just invents blurry pixels and wastes bytes. A good
build script clamps to the source's real width (this project's
[node/optimize-images.js](../node/optimize-images.js) does exactly that).

### Quality setting

Quality is a 0–100 knob on the compressor. Counter-intuitively, **you almost
never want 100** — the file balloons and human eyes can't tell the difference.

- Photos: **q75–q82** is the sweet spot (this project uses 82).
- The difference between q82 and q95 is often **2× the file size for zero visible
  gain.** Trust your eyes on a real screen, not the number.

---

## 5. Responsive images: `srcset`, `sizes`, and `<picture>`

Now we wire those formats and sizes into HTML so the browser auto-picks the best
file. There are two tools. Learn both.

### Tool 1: `srcset` + `sizes` (same format, different sizes)

Use this when you only care about **resolution**, not format switching.

```html
<img
  src="photo-960.jpg"
  srcset="
    photo-320.jpg 320w,
    photo-640.jpg 640w,
    photo-960.jpg 960w,
    photo-1280.jpg 1280w
  "
  sizes="(min-width: 64rem) 50vw, 100vw"
  alt="A clear description of the photo"
  width="1280" height="720"
  loading="lazy" decoding="async">
```

Reading it piece by piece:

- **`srcset`** = the menu of files. The `320w`, `640w` etc. tell the browser the
  *real pixel width* of each file (the `w` means "width descriptor"). This is
  **not** a CSS instruction — it's you handing the browser a price list.
- **`sizes`** = "how wide will this image be displayed?" Here:
  *"If the screen is at least 64rem wide, I'll show this at 50% of viewport width;
  otherwise at 100%."* The browser combines this with the screen's DPR to pick the
  smallest file from `srcset` that still looks sharp.
- **`src`** = the fallback for ancient browsers that ignore `srcset`. Pick a
  sensible middle size.
- **`width` / `height`** = the *intrinsic* dimensions. Critical for CLS — see
  section 7.

> **The mistake to avoid:** writing `sizes="100vw"` when the image is actually in
> a narrow column. The browser believes you and downloads a giant file. `sizes`
> must roughly match how big the image *really* renders.

### Tool 2: `<picture>` (different formats AND sizes)

Use this when you want the **AVIF → WebP → JPEG** fallback chain. The `<picture>`
element is a wrapper that holds several `<source>` options plus one `<img>`. The
browser walks the sources top to bottom and uses the **first one it supports**.

```html
<picture>
  <!-- Best format first -->
  <source
    type="image/avif"
    srcset="photo-320.avif 320w, photo-640.avif 640w, photo-960.avif 960w"
    sizes="(min-width: 64rem) 50vw, 100vw">

  <!-- Next best -->
  <source
    type="image/webp"
    srcset="photo-320.webp 320w, photo-640.webp 640w, photo-960.webp 960w"
    sizes="(min-width: 64rem) 50vw, 100vw">

  <!-- Universal fallback + ALL the real attributes live on the <img> -->
  <img
    src="photo-960.jpg"
    srcset="photo-320.jpg 320w, photo-640.jpg 640w, photo-960.jpg 960w"
    sizes="(min-width: 64rem) 50vw, 100vw"
    alt="A clear description of the photo"
    width="960" height="540"
    loading="lazy" decoding="async">
</picture>
```

Key things juniors get wrong:

1. **The `<img>` is mandatory and does the real work.** `alt`, `width`, `height`,
   `loading`, `class`, etc. all go on the `<img>`, *not* on `<source>`. If you
   forget the `<img>`, nothing renders.
2. **Order matters.** Smallest/most-modern format first. The browser stops at the
   first match.
3. **Each `<source>` repeats `sizes`** so the resolution logic works inside each
   format.

This looks verbose — that's why you **generate it with a script** rather than
hand-typing it (section 11).

---

## 6. Lazy loading vs. eager loading (and the LCP trap)

By default the browser tries to load every image immediately. On a media-heavy
page that's a traffic jam. **Lazy loading** tells the browser: "Don't fetch this
until the user is about to scroll to it."

```html
<!-- Below the fold: load it only when needed -->
<img src="gallery-5.jpg" loading="lazy" decoding="async" alt="…">
```

- `loading="lazy"` → defer until near the viewport. Use on **everything below the
  fold**.
- `decoding="async"` → decode off the main thread so it doesn't freeze scrolling.
  Safe to put on basically every image.

### The trap that breaks Lighthouse

**Never lazy-load your LCP image** (the big hero/first image visible without
scrolling). Lazy-loading it tells the browser to *wait*, which delays the exact
thing Lighthouse is timing. Result: a worse LCP score from "optimizing."

For above-the-fold / hero images, do the opposite — **load it as early and as
urgently as possible:**

```html
<!-- Above the fold: load it NOW, with priority -->
<img src="hero-1280.jpg" fetchpriority="high" decoding="async" alt="…">
```

And go one step further — tell the browser to start downloading it *before* it
even reaches the `<img>` tag, using a **preload** in the `<head>`:

```html
<head>
  <!-- Start fetching the LCP image during HTML parsing -->
  <link rel="preload" as="image" type="image/avif"
        imagesrcset="hero-320.avif 320w, hero-640.avif 640w, hero-1280.avif 1280w, hero-1920.avif 1920w"
        imagesizes="(min-width: 64rem) 70vw, 100vw"
        fetchpriority="high">
</head>
```

> **Rule:** exactly **one** preload per page — the single most important image.
> Preloading everything is the same as preloading nothing (you create a new
> traffic jam). The `imagesizes` here **must match** the `sizes` on the actual
> image, or the browser downloads one file then needs a different one.

Simple summary:

| Image position | `loading` | `fetchpriority` | Preload in `<head>`? |
|----------------|-----------|-----------------|----------------------|
| Hero / LCP (above fold) | omit (eager) | `high` | Yes (one) |
| Everything else | `lazy` | omit | No |

---

## 7. Preventing layout shift (CLS)

When an image has no declared size, the browser doesn't know how tall it'll be,
so it reserves **zero** space. The text renders, *then* the image arrives and
shoves everything down. That jump is layout shift, and users hate clicking a
button that just moved.

**The fix is trivial: always set `width` and `height` on `<img>`.**

```html
<img src="photo-960.jpg" width="960" height="540" alt="…">
```

You're not forcing the display size — CSS still controls that. You're giving the
browser the **aspect ratio** so it can reserve the right amount of space *before*
the file arrives. Modern browsers compute `aspect-ratio: 960 / 540` from those
two numbers automatically.

Then in CSS, let it scale fluidly while keeping that ratio:

```css
img {
  max-width: 100%;
  height: auto; /* respects the reserved aspect ratio */
}
```

> A good build script reads the real dimensions from each source and writes them
> into the HTML for you, so you never guess.

---

## 8. Background images in CSS

`background-image` can't use `srcset`/`<picture>`. Instead CSS has **`image-set()`**,
which is the same idea — offer formats, let the browser pick.

```css
.hero {
  /* Plain fallback first, for very old engines */
  background-image: url("hero-1280.webp");

  /* Then the smart version: browser chooses the best format it supports */
  background-image: image-set(
    url("hero-1280.avif") type("image/avif"),
    url("hero-1280.webp") type("image/webp"),
    url("hero-1280.jpg")  type("image/jpeg")
  );

  background-size: cover;
  background-position: center;
}

/* Swap to a bigger file on large screens via a normal media query */
@media (min-width: 90rem) {
  .hero {
    background-image: image-set(
      url("hero-1920.avif") type("image/avif"),
      url("hero-1920.webp") type("image/webp"),
      url("hero-1920.jpg")  type("image/jpeg")
    );
  }
}
```

Why two `background-image` lines? The first plain `url()` is a fallback for
engines that don't understand `image-set()`; they read it and ignore the second
line, while modern browsers use the second and override the first.

> **Prefer a real `<img>`/`<picture>` over a CSS background whenever the image is
> *content*** (it means something, has a subject). Backgrounds are for decorative
> texture only — they can't have `alt` text and can't be the LCP element as
> reliably.

---

## 9. Video: the heavyweight

Everything true of images is **10× more true** of video. A few rules keep it sane.

### Pick the right format chain

| Format | Role | Notes |
|--------|------|-------|
| **WebM (VP9/AV1)** | Smallest, modern | Serve first |
| **MP4 (H.264)** | Universal fallback | Every device plays it |

Offer both and let the browser choose, just like images:

```html
<video autoplay muted loop playsinline width="1280" height="720">
  <source src="loop.webm" type="video/webm">
  <source src="loop.mp4"  type="video/mp4">
</video>
```

The browser uses the first `<source>` it can play. WebM is typically **60–70%
smaller** than the equivalent MP4 — in this project the loop is 327 KB WebM vs
910 KB MP4 for the same footage.

### The attributes that actually matter

- **`muted`** — required for autoplay. Browsers block autoplay *with* sound.
- **`autoplay`** — starts without a click. Only works if `muted`.
- **`loop`** — repeats. Standard for ambient background loops.
- **`playsinline`** + **`webkit-playsinline`** — **critical for iOS Safari.**
  Without these, iPhones rip your background video out of the page and force it
  fullscreen. This is the #1 "works on my machine, broken on iPhone" video bug.
- **`preload="auto"`** for a hero loop you *know* will play; **`preload="none"`**
  or **`metadata`** for videos further down that may never be watched.

### Compress before you ship

Use **ffmpeg** (free, command-line) to shrink and convert. A reasonable hero-loop
recipe:

```bash
# MP4 (H.264) — universal fallback, CRF 23 = good quality/size balance
ffmpeg -i source.mov -c:v libx264 -crf 23 -preset slow -an -movflags +faststart loop.mp4

# WebM (VP9) — smaller, served first
ffmpeg -i source.mov -c:v libvpx-vp9 -crf 33 -b:v 0 -an loop.webm
```

What the flags mean:

- **`-crf`** = quality knob (lower = better quality + bigger). 23 for H.264, ~33
  for VP9 are sane starting points.
- **`-an`** = **drop the audio track.** A silent background loop doesn't need
  audio — removing it saves real bytes.
- **`-movflags +faststart`** = moves the MP4 index to the front so playback can
  begin before the whole file downloads. Always use it for web MP4.
- **`-preset slow`** = let the encoder work harder for a smaller file (one-time
  cost at build, permanent win for users).

> **Resolution discipline applies to video too.** A full-screen background loop
> almost never needs to be more than **1280px or 1920px** wide. Don't ship 4K for
> a muted ambient loop nobody studies frame-by-frame.

---

## 10. Hero / background video, the right way

A background video has a hidden problem: it takes a second or two to start, and
until it does, the user stares at a **black box**. That black flash hurts both
perceived speed and your LCP.

**The fix: a poster image.** The `poster` attribute shows a still frame instantly
while the video loads — so the hero looks "done" immediately, then the motion
quietly begins.

```html
<video
  class="hero-video"
  autoplay muted loop playsinline webkit-playsinline
  preload="auto"
  poster="hero-poster-1280.jpg"
  aria-hidden="true">
  <source src="loop.webm" type="video/webm">
  <source src="loop.mp4"  type="video/mp4">
</video>
```

How to make the poster (grab a representative frame with ffmpeg, then optimize it
exactly like any other image):

```bash
# Grab a frame 1 second in (skips a black intro frame)
ffmpeg -ss 00:00:01 -i loop.mp4 -frames:v 1 -q:v 2 hero-poster.jpg
# …then run it through your normal image pipeline to make AVIF/WebP/JPEG sizes
```

> **Format choice for the poster:** the `poster` attribute can't do format
> fallback (it's a single URL), so use a **JPEG** there for bulletproof support
> on every engine. Reserve AVIF/WebP for the `<img>`/`<picture>` and CSS
> backgrounds where fallback chains exist.

Other hero-video best practices:

- Add **`aria-hidden="true"`** to a purely decorative loop so screen readers skip
  it.
- Respect **reduced motion** — some users get motion sick. Offer a static poster
  instead of the loop when they've asked for less motion:

```css
@media (prefers-reduced-motion: reduce) {
  .hero-video { display: none; }
  .hero { background-image: url("hero-poster-1280.jpg"); background-size: cover; }
}
```

- **Don't autoplay video to save data on slow connections** if you can avoid it.
  At minimum, keep it muted, looped, short, and compressed.

---

## 11. The build pipeline: automate it

You will **not** hand-make six sizes × three formats for forty images. You'll go
insane and make typos. Automate it with a tiny Node script using
[**sharp**](https://sharp.pixelplumbing.com/) (the standard fast image library)
and **ffmpeg** for video.

The shape of an image pipeline (this project's
[node/optimize-images.js](../node/optimize-images.js) does all of this):

1. Read every source image from a folder.
2. For each, generate the size ladder `[320, 640, 960, 1280, 1600, 1920]` —
   **clamped to the source's real width** (never upscale).
3. For each size, write **AVIF + WebP + JPEG** at a fixed quality (e.g. 82).
4. Name them predictably: `name-640.avif`, `name-640.webp`, `name-640.jpg`.
5. **Skip files that already exist and are newer than the source** (idempotent —
   re-running is nearly instant; only changed images get reprocessed).

Minimal sharp example to internalize the idea:

```js
// make-sizes.js — run with: node make-sizes.js
import sharp from "sharp";

const widths = [320, 640, 960, 1280, 1600, 1920];
const source = "media/source/hero.jpg";

for (const w of widths) {
  // Don't upscale: sharp's withoutEnlargement keeps small sources small.
  const pipeline = sharp(source).resize({ width: w, withoutEnlargement: true });

  await pipeline.clone().avif({ quality: 82 }).toFile(`media/optimized/hero-${w}.avif`);
  await pipeline.clone().webp({ quality: 82 }).toFile(`media/optimized/hero-${w}.webp`);
  await pipeline.clone().jpeg({ quality: 82 }).toFile(`media/optimized/hero-${w}.jpg`);
}
```

Then wire it into `package.json` so it's one command:

```json
{
  "scripts": {
    "images": "node node/optimize-images.js",
    "compress:hero": "node node/compress-hero-images.js"
  }
}
```

```bash
npm run images   # regenerate all optimized images
```

Going further, a second script can **auto-wrap your `<img>` tags into full
`<picture>` blocks** (this project's [node/wrap-pictures.js](../node/wrap-pictures.js)),
reading the real dimensions from disk and writing correct `width`/`height` for
you. Write HTML with a plain `<img>` once; let the script produce the verbose
responsive markup. **You stay sane, the browser gets the optimized version.**

> **Why automate even on a small site:** the first run is a one-time cost
> (minutes). Every run after is near-instant thanks to the skip-if-unchanged
> rule. And it's *consistent* — no forgotten format, no wrong size, no typo'd
> `sizes`.

---

## 12. Measuring: Lighthouse & friends

Don't guess — measure. Optimization without measurement is superstition.

- **Lighthouse** (built into Chrome DevTools → "Lighthouse" tab). Run it in
  **Incognito** (extensions skew results) and choose **Mobile** — mobile is the
  harder, more honest test. Watch **Performance**, especially **LCP** and **CLS**.
- **DevTools → Network panel.** Sort by size. Throttle to "Fast 3G" to feel what a
  real phone feels. Check that the file the browser actually downloaded is the
  *right size* — if a 400px slot pulled the 1920px file, your `sizes` is wrong.
- **DevTools → Performance panel.** Records the actual paint timeline; it
  literally labels the LCP element so you know what to optimize.
- **WebPageTest.org** for a deeper, real-device-style report when you want detail.

What "good" looks like:

| Metric | Good | Needs work |
|--------|------|------------|
| LCP | < 2.5 s | > 4 s |
| CLS | < 0.1 | > 0.25 |
| Performance score (mobile) | 90+ | < 50 |

If LCP is bad → your hero media is too big or not prioritized (sections 6 & 10).
If CLS is bad → you forgot `width`/`height` somewhere (section 7).

---

## 13. Quick copy-paste reference

**Content photo, below the fold (lazy, responsive, format fallback):**

```html
<picture>
  <source type="image/avif" srcset="photo-320.avif 320w, photo-640.avif 640w, photo-960.avif 960w" sizes="(min-width: 64rem) 50vw, 100vw">
  <source type="image/webp" srcset="photo-320.webp 320w, photo-640.webp 640w, photo-960.webp 960w" sizes="(min-width: 64rem) 50vw, 100vw">
  <img src="photo-960.jpg"
       srcset="photo-320.jpg 320w, photo-640.jpg 640w, photo-960.jpg 960w"
       sizes="(min-width: 64rem) 50vw, 100vw"
       alt="Clear description" width="960" height="540"
       loading="lazy" decoding="async">
</picture>
```

**Hero image, above the fold (eager, preloaded):**

```html
<!-- in <head> -->
<link rel="preload" as="image" type="image/avif"
      imagesrcset="hero-640.avif 640w, hero-1280.avif 1280w, hero-1920.avif 1920w"
      imagesizes="(min-width: 64rem) 70vw, 100vw" fetchpriority="high">

<!-- in <body> -->
<img src="hero-1280.jpg"
     srcset="hero-640.jpg 640w, hero-1280.jpg 1280w, hero-1920.jpg 1920w"
     sizes="(min-width: 64rem) 70vw, 100vw"
     alt="Hero description" width="1920" height="1080"
     fetchpriority="high" decoding="async">
```

**Background image (CSS):**

```css
.hero {
  background-image: url("hero-1280.webp");
  background-image: image-set(
    url("hero-1280.avif") type("image/avif"),
    url("hero-1280.webp") type("image/webp"),
    url("hero-1280.jpg")  type("image/jpeg")
  );
  background-size: cover;
  background-position: center;
}
```

**Hero background video (with poster + iOS fixes):**

```html
<video autoplay muted loop playsinline webkit-playsinline
       preload="auto" poster="hero-poster-1280.jpg" aria-hidden="true"
       width="1280" height="720">
  <source src="loop.webm" type="video/webm">
  <source src="loop.mp4"  type="video/mp4">
</video>
```

**ffmpeg cheat sheet:**

```bash
# Compress MP4 (universal)
ffmpeg -i in.mov -c:v libx264 -crf 23 -preset slow -an -movflags +faststart out.mp4
# Compress WebM (smaller, serve first)
ffmpeg -i in.mov -c:v libvpx-vp9 -crf 33 -b:v 0 -an out.webm
# Grab a poster frame at 1s
ffmpeg -ss 00:00:01 -i out.mp4 -frames:v 1 -q:v 2 poster.jpg
```

---

## 14. Pre-launch checklist

Run through this before every launch of a media-heavy page.

**Images**
- [ ] Every photo exists as **AVIF + WebP + JPEG**.
- [ ] Logos and icons are **SVG**, not PNG/JPEG.
- [ ] No image is larger in pixels than its biggest display size (× DPR).
- [ ] Quality is ~**75–82**, not 100.
- [ ] Every `<img>` has **`width` and `height`** (CLS).
- [ ] Every `<img>` has meaningful **`alt`** (empty `alt=""` only if decorative).
- [ ] Below-the-fold images use **`loading="lazy"`**.
- [ ] `sizes` roughly matches the real rendered width (no `100vw` on a sidebar).

**The hero / LCP**
- [ ] LCP image is **NOT** lazy-loaded.
- [ ] LCP image has **`fetchpriority="high"`** and one **`<link rel="preload">`**.
- [ ] `imagesizes` on the preload matches `sizes` on the `<img>`.

**Video**
- [ ] WebM **and** MP4 sources provided (WebM first).
- [ ] `muted playsinline webkit-playsinline` present (iOS!).
- [ ] Audio track stripped (`-an`) on silent loops.
- [ ] `-movflags +faststart` on the MP4.
- [ ] A **`poster`** image (JPEG) is set so there's no black flash.
- [ ] `prefers-reduced-motion` fallback to a static poster.

**Process**
- [ ] All conversion is **automated by a script**, not done by hand.
- [ ] Re-ran **Lighthouse (mobile, incognito)** — LCP < 2.5 s, CLS < 0.1.
- [ ] Checked the **Network panel**: the browser downloaded the *right* sizes.

---

*Master these and "image- and video-heavy" stops being a synonym for "slow." The
whole game is: smallest good-looking file, best format the browser supports, at
the right moment, without shifting the layout. Everything else is detail.*
