/* =============================================================================
 * pi-security-curtain.js
 * Stacked-curtain reveal effect for the Private Investigations & Security page.
 *
 * Every transition between panels is a curtain — not just the first.
 *
 * Layout primer:
 *   .curtain-stage   — tall scroll container; provides the scroll length the
 *                      timeline scrubs across.
 *   .curtain-track   — sticky 100vh frame inside the stage.
 *   .curtain-section — absolutely-positioned panels stacked inside the track.
 *                      Each non-hero panel has an .overlay that initially
 *                      covers its .content.
 *
 * Timeline beats:
 *   beat 0       Panel 1 rises from below the viewport (yPercent 100 → 0),
 *                covering the hero.
 *   then, per panel (starting with panel 1):
 *     overlay   Panel's .overlay slides UP off the top (yPercent 0 → -100),
 *                revealing the panel's own .content beneath.
 *     content   Panel's .content slides UP off the top (yPercent 0 → -100),
 *                revealing the NEXT panel's overlay (which has been sitting
 *                at rest beneath the current panel the whole time).
 *   The final panel skips the content lift — there is nothing beneath it.
 *
 * Z-index is reversed for panels 2..N so each subsequent panel sits BENEATH
 * the previous one — that's what lets the previous panel's content lift up
 * and expose the next overlay underneath.
 *
 * The whole timeline is scrubbed by a single ScrollTrigger so the reveal
 * always reflects scroll position — no jank, fully reversible.
 *
 * gsap.matchMedia() disables the effect under `prefers-reduced-motion: reduce`
 * so the page degrades to a plain stacked layout.
 *
 * Dependencies (loaded before this script in pr-security.html):
 *   - gsap (window.gsap)
 *   - ScrollTrigger (window.ScrollTrigger)
 * ============================================================================= */

(function initCurtainReveal() {
    // Bail out if GSAP / ScrollTrigger failed to load (offline, blocked CDN, etc.)
    if (typeof window.gsap === 'undefined' || typeof window.ScrollTrigger === 'undefined') {
        console.warn('[pr-security] GSAP / ScrollTrigger unavailable — curtain reveal disabled.');
        document.documentElement.classList.add('curtain-fallback');
        return;
    }

    gsap.registerPlugin(ScrollTrigger);

    const stage = document.querySelector('.curtain-stage');
    const panels = gsap.utils.toArray('.curtain-stage .curtain-section');
    if (!stage || panels.length < 2) return;

    const mm = gsap.matchMedia();

    // The curtain only runs on viewports wide enough for a panel's content to
    // fit the 100vh frame (desktop / laptop, >64rem) AND where motion is
    // welcome. Narrower screens fall through to the static-flow branch below,
    // where every panel renders in full and scrolls natively — a pinned,
    // scroll-scrubbed curtain would otherwise clip the taller tablet/mobile
    // stacks.
    mm.add('(min-width: 64.0625rem) and (prefers-reduced-motion: no-preference)', () => {

        // Leaving a narrower breakpoint: drop the static-flow flag and
        // (re)enable touch-scroll normalization for the life of the curtain.
        document.documentElement.classList.remove('curtain-fallback');
        if (ScrollTrigger.isTouch === 1) {
            ScrollTrigger.normalizeScroll(true);
        }

        // Total scroll length is unchanged: 2 beats per non-hero panel.
        // Beat layout (one-off, then a repeating pair per panel):
        //   beat 0           : panel 1 rises from below to cover the hero
        //   beat 1           : panel 1's overlay lifts, revealing panel 1 content
        //   beat 2           : panel 1's content lifts, revealing panel 2's
        //                       overlay sitting at rest beneath it
        //   beat 3           : panel 2's overlay lifts, revealing panel 2 content
        //   beat 4           : panel 2's content lifts, revealing panel 3's overlay
        //   ...
        // The final panel only needs an overlay lift (no further panel to reveal),
        // which keeps the total at (panels.length - 1) * 2 beats.
        const beatCount = (panels.length - 1) * 2;
        const stageHeightVh = beatCount * 100;
        stage.style.height = stageHeightVh + 'vh';

        // Initial state.
        //
        // Z-INDEX ORDERING (key to the reveal-by-lifting effect):
        //   Hero          — z-index 1 (bottom of the stack). Sits alone in
        //                   the viewport at rest.
        //   Panel 1       — HIGHEST z-index. Rises from below to cover the
        //                   hero on the first scroll beat.
        //   Panel 2..N    — Descending z-index. Each is parked off-screen
        //                   (yPercent: 100) at rest and snapped into place
        //                   (yPercent: 0) one beat before it needs to be
        //                   revealed by lifting the previous panel's content.
        //
        // OVERLAYS: every panel's `.overlay` starts at yPercent: 0, covering
        // its own content. The overlay is what the user sees just before the
        // panel's detail content is revealed.
        panels.forEach((panel, i) => {
            if (i === 0) {
                // Hero
                gsap.set(panel, { yPercent: 0, zIndex: 1 });
                return;
            }
            // Every non-hero panel: parked off-screen, descending z-index
            // so panel 1 is on top and the FAQ panel is at the bottom of
            // the non-hero stack.
            gsap.set(panel, { yPercent: 100, zIndex: panels.length - i + 1 });
            const overlay = panel.querySelector('.overlay');
            if (overlay) gsap.set(overlay, { yPercent: 0 });
        });

        // Single scrubbed timeline — pins the stage's sticky track
        // visually (sticky CSS does the pinning) while we advance
        // through the timeline based on scroll progress through the
        // stage's tall outer container.
        const tl = gsap.timeline({
            defaults: { ease: 'none' },
            scrollTrigger: {
                trigger: stage,
                start: 'top top',
                end: 'bottom bottom',
                scrub: true,
                invalidateOnRefresh: true,
            },
        });

        // Beat 0 (one-off): panel 1 rises from below to cover the hero.
        tl.to(panels[1], { yPercent: 0, duration: 1 });

        // For each non-hero panel:
        //   - lift its overlay (reveals the panel's detail content),
        //   - snap the NEXT panel into place (off-screen → at rest), still
        //     hidden behind this panel because of the descending z-index,
        //   - then lift this panel's content (reveals the next panel's
        //     overlay underneath).
        // The very last panel skips the content-lift step — there is nothing
        // beneath it to reveal — which keeps the total beat count at
        // 1 (rise) + N (overlay lifts) + (N - 1) (content lifts) = 2N.
        for (let i = 1; i < panels.length; i++) {
            const panel = panels[i];
            const overlay = panel.querySelector('.overlay');
            const content = panel.querySelector('.content');

            if (overlay) {
                tl.to(overlay, { yPercent: -100, duration: 1 });
            } else {
                tl.to({}, { duration: 1 });
            }

            if (i < panels.length - 1) {
                // Snap the next panel into place while it is still hidden
                // behind the current panel's content (lower z-index), ready
                // to be exposed by the upcoming content lift.
                tl.set(panels[i + 1], { yPercent: 0 });

                if (content) {
                    tl.to(content, { yPercent: -100, duration: 1 });
                } else {
                    tl.to({}, { duration: 1 });
                }

                // Once this panel's content has lifted off-screen the section
                // shell itself (still at yPercent:0, still full-viewport, with
                // a higher z-index than the panels beneath it) keeps absorbing
                // pointer events — that's why the FAQ accordion at the bottom
                // of the stack stops responding to clicks once you reach it.
                // Disable pointer events on the now-empty shell; gsap.set()
                // reverses cleanly when the user scrolls back up.
                tl.set(panel, { pointerEvents: 'none' });
            }
        }

        // -----------------------------------------------------------------
        // Background zoom — one scrub PER overlay, not a single global one.
        //
        // Each overlay owns a LOCAL `--bg-zoom` (an inline style GSAP writes
        // on the `.overlay` element itself), which the overlay's `::before`
        // reads as `transform: scale(...)`. A local value overrides the
        // inherited one, so every panel's photo starts fresh at scale 1 the
        // moment it enters the viewport and zooms to BG_ZOOM_MAX across the
        // ~2-beat window it is on screen.
        //
        // This replaces the previous single global scrub on `.curtain-stage`
        // (1 → 2.5 across the whole timeline). Because that value progressed
        // continuously and was inherited by all overlays, each successive
        // panel entered at the elevated scale the previous panel left off at
        // (zoom creep: panel 2 ≈ 1.25, panel 3 ≈ 1.5, … panel 6 ≈ 2.4).
        //
        // Window math: the timeline runs 1 (panel-1 rise) + N overlay lifts +
        // (N-1) content lifts = 2N beats. overlay[i] is REVEALED across beat
        // [2*i-2, 2*i-1] (the previous panel's content lifting away, or the
        // rise for panel 1) and then LIFTS off across beat [2*i-1, 2*i].
        //
        // To honour "scale 1 the first time it scrolls into view, then zoom",
        // we hold the photo at scale 1 for the entire reveal and only start
        // the zoom at beat 2*i-1 — the moment the panel is fully on screen —
        // running the 1 → BG_ZOOM_MAX scrub across its single lift beat. The
        // `fromTo` seeds `--bg-zoom: 1` immediately, so during the reveal
        // (before this tween's start position) the value already reads 1.
        // Adding these tweens to the scrubbed master timeline ties the zoom to
        // scroll position automatically — fully reversible, no extra triggers.
        // -----------------------------------------------------------------
        const BG_ZOOM_MAX = 1.25;
        for (let i = 1; i < panels.length; i++) {
            const overlay = panels[i].querySelector('.overlay');
            if (!overlay) continue;
            tl.fromTo(overlay,
                { '--bg-zoom': 1 },
                { '--bg-zoom': BG_ZOOM_MAX, duration: 1, ease: 'none' },
                2 * i - 1
            );
        }

        // Recalculate after fonts / images settle so the stage height
        // and ScrollTrigger snapshot stay in sync.
        window.addEventListener('load', () => ScrollTrigger.refresh());

        // Cleanup hook — gsap.matchMedia() handles this automatically
        // when the media query stops matching.
        return () => {
            stage.style.height = '';
            stage.style.removeProperty('--bg-zoom');
            // Release the touch-scroll takeover so native scrolling is restored
            // once we drop into the static (small-screen / reduced-motion) flow.
            ScrollTrigger.normalizeScroll(false);
        };
    });

    // Static flow — small screens (≤64rem) OR a reduced-motion preference.
    // The CSS in `_pr-security-page.scss` (`@include curtain-static`) already
    // collapses the absolute stack into a normal, fully-scrollable column and
    // hides the decorative overlays. Here we only clear the inflated inline
    // stage height and flag <html> so the no-JS/GSAP-missing styles apply too.
    mm.add('(max-width: 64rem), (prefers-reduced-motion: reduce)', () => {
        stage.style.height = '';
        document.documentElement.classList.add('curtain-fallback');
        return () => {
            document.documentElement.classList.remove('curtain-fallback');
        };
    });
})();
