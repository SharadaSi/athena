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

    // Smooth out touch-device scroll quirks (per the GSAP codepen reference)
    if (ScrollTrigger.isTouch === 1) {
        ScrollTrigger.normalizeScroll(true);
    }

    const stage = document.querySelector('.curtain-stage');
    const panels = gsap.utils.toArray('.curtain-stage .curtain-section');
    if (!stage || panels.length < 2) return;

    const mm = gsap.matchMedia();

    mm.add('(prefers-reduced-motion: no-preference)', () => {

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

        // Recalculate after fonts / images settle so the stage height
        // and ScrollTrigger snapshot stay in sync.
        window.addEventListener('load', () => ScrollTrigger.refresh());

        // -----------------------------------------------------------------
        // Background zoom — one continuous scrub tied to the actual page
        // scroll position. `--bg-zoom` lives on `.curtain-stage` and is
        // inherited by every `.service-panel__overlay`; each overlay's
        // `::before` reads it as `transform: scale(...)`. Because the
        // value progresses continuously with scroll (not per overlay),
        // the zoom carries over across curtain transitions — scrolling
        // down keeps zooming the visible photo in, scrolling up reverses
        // it. The range is generous so the user sees real motion within
        // each overlay's ~2-beat window (~1/6 of the timeline → ~0.25 of
        // the 1 → 2.5 range, i.e. a 25% scale change per panel).
        // -----------------------------------------------------------------
        gsap.fromTo(stage,
            { '--bg-zoom': 1 },
            {
                '--bg-zoom': 2.5,
                ease: 'none',
                scrollTrigger: {
                    trigger: stage,
                    start: 'top top',
                    end: 'bottom bottom',
                    scrub: true,
                    invalidateOnRefresh: true,
                },
            }
        );

        // Cleanup hook — gsap.matchMedia() handles this automatically
        // when the media query stops matching.
        return () => {
            stage.style.height = '';
            stage.style.removeProperty('--bg-zoom');
        };
    });

    // Reduced-motion fallback — the CSS in `_pr-security-page.scss` already
    // lays panels out in flow. We only need to make sure the stage doesn't
    // have an inflated inline height.
    mm.add('(prefers-reduced-motion: reduce)', () => {
        stage.style.height = '';
        document.documentElement.classList.add('curtain-fallback');
    });
})();
