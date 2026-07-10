// js/sanity-image.js
//
// Tiny helper that turns a raw Sanity Image CDN URL into a responsive
// `<img>`-ready bundle of `src`, `srcset`, and `sizes`. Hand-rolled (no
// `@sanity/image-url` dependency) so the site keeps its zero-build, vanilla
// JS deployment story.
//
// Sanity's image CDN supports a handful of query params we use here:
//   • `w`            — target width in pixels.
//   • `auto=format`  — picks AVIF / WebP / JPG per the request `Accept` header.
//                      Lighthouse "Serve images in next-gen formats" relies
//                      on this for non-static sources.
//   • `q=75`         — quality that matches our local pipeline's mid-range
//                      target. Sanity defaults to 75 anyway; explicit is
//                      better than implicit.
//   • `fit=max`      — preserve aspect ratio and never upscale past the
//                      source's native pixels. Cheaper than `clip` /
//                      `crop` and avoids weird letterboxing on tall portraits.
//
// Usage
// -----
//   const { src, srcset, sizes } = window.buildSanityImg({
//     url: post.imageUrl,            // raw cdn.sanity.io URL from GROQ
//     sizes: '(min-width: 64rem) 50vw, 100vw',
//     widths: [320, 640, 960, 1280, 1600], // optional, sensible default
//   });
//   img.src = src;
//   img.srcset = srcset;
//   img.sizes = sizes;
//
// All HTML pages that consume Sanity data must load this file BEFORE
// `js/sanity-content.js` and `js/article-content.js` so the global is ready
// by the time those modules try to render.

(function () {
  'use strict';

  // Default responsive widths. Matches the breakpoints in
  // node/optimize-images.js so locally-hosted and Sanity-hosted images deliver
  // the same density steps and the browser can pick a consistent width.
  var DEFAULT_WIDTHS = [320, 640, 960, 1280, 1600];

  // Default `sizes` clause: assume a single-column mobile layout that grows
  // to roughly half the viewport on desktop (typical card layout). Callers
  // should pass their own `sizes` when the layout differs.
  var DEFAULT_SIZES = '(min-width: 64rem) 50vw, 100vw';

  // Default quality. Matches our local pipeline's mid-range so visual parity
  // between local and CDN images is consistent.
  var DEFAULT_QUALITY = 75;

  /**
   * Append a query parameter to a URL, preserving any existing query string.
   * Safe against double-encoding because we control every key/value here.
   */
  function withParam(url, key, value) {
    if (!url) return url;
    var sep = url.indexOf('?') === -1 ? '?' : '&';
    return url + sep + key + '=' + value;
  }

  /**
   * Build a transformed URL for a single width. We always append the same
   * trio (`auto=format`, `q=`, `fit=max`) on top of the caller's `w=`.
   * Order matters only for the leading `?` vs `&` separator — Sanity treats
   * params order-independently otherwise.
   */
  function urlAtWidth(url, width, quality) {
    var out = withParam(url, 'w', String(width));
    out = withParam(out, 'auto', 'format');
    out = withParam(out, 'q', String(quality));
    out = withParam(out, 'fit', 'max');
    return out;
  }

  /**
   * Produce { src, srcset, sizes } for an `<img>` element.
   *
   * @param {object} opts
   * @param {string} opts.url      – raw Sanity CDN URL (no query string).
   * @param {number[]} [opts.widths] – responsive width buckets (px).
   * @param {string} [opts.sizes]    – `sizes` attribute clause for the layout.
   * @param {number} [opts.quality]  – encoder quality (0–100).
   * @returns {{ src: string, srcset: string, sizes: string }}
   */
  function buildSanityImg(opts) {
    var o = opts || {};
    if (!o.url) return { src: '', srcset: '', sizes: '' };

    var widths = Array.isArray(o.widths) && o.widths.length > 0 ? o.widths : DEFAULT_WIDTHS;
    var sizes = typeof o.sizes === 'string' && o.sizes.length > 0 ? o.sizes : DEFAULT_SIZES;
    var quality = typeof o.quality === 'number' ? o.quality : DEFAULT_QUALITY;

    // Use the widest variant for `src` — this is what `<img>` falls back to
    // when `srcset`/`sizes` aren't supported. Browsers that DO support srcset
    // pick a narrower width based on the viewport / DPR, so the wide src is
    // only fetched as a last resort.
    var fallbackWidth = widths[widths.length - 1];

    var srcset = widths
      .map(function (w) { return urlAtWidth(o.url, w, quality) + ' ' + w + 'w'; })
      .join(', ');

    return {
      src: urlAtWidth(o.url, fallbackWidth, quality),
      srcset: srcset,
      sizes: sizes,
    };
  }

  /**
   * Apply the responsive bundle directly to an existing `<img>` element and
   * add the iOS-friendly `loading`/`decoding` defaults the rest of the site
   * uses. Skips `loading="lazy"` when the caller explicitly opts the image
   * out via `data-eager="true"` (set on LCP candidates).
   */
  function applyToImg(img, opts) {
    if (!img) return;
    var bundle = buildSanityImg(opts);
    if (!bundle.src) return;

    img.src = bundle.src;
    img.srcset = bundle.srcset;
    img.sizes = bundle.sizes;

    if (!img.hasAttribute('decoding')) img.setAttribute('decoding', 'async');
    if (!img.hasAttribute('loading')) {
      img.setAttribute('loading', img.dataset.eager === 'true' ? 'eager' : 'lazy');
    }

    // Reserve layout space when the caller has projected the asset's intrinsic
    // dimensions from `metadata.dimensions` (kills Cumulative Layout Shift).
    if (opts && opts.dimensions) {
      if (opts.dimensions.width && !img.hasAttribute('width')) {
        img.setAttribute('width', String(opts.dimensions.width));
      }
      if (opts.dimensions.height && !img.hasAttribute('height')) {
        img.setAttribute('height', String(opts.dimensions.height));
      }
    }

    // Paint the LQIP blur-up as a CSS background so the image area never
    // shows as blank before the real bytes arrive. Cleared on `load`.
    if (opts && opts.lqip && !img.dataset.lqipApplied) {
      img.style.backgroundImage = 'url("' + opts.lqip + '")';
      img.style.backgroundSize = 'cover';
      img.style.backgroundPosition = 'center';
      img.dataset.lqipApplied = '1';
      img.addEventListener(
        'load',
        function () {
          img.style.backgroundImage = '';
        },
        { once: true },
      );
    }
  }

  window.buildSanityImg = buildSanityImg;
  window.applySanityImg = applyToImg;
})();
