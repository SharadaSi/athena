/**
 * Services — scroll-triggered irregular grid.
 *
 * Outer service cards start parked underneath the centre anchor (the image
 * cell, which has a higher z-index). As the user scrolls through the pinned
 * section the cards emerge from beneath the anchor toward their natural grid
 * positions, staggered "from: center" for a wave-out effect.
 *
 * Depends on (loaded globally before this file):
 *   - window.gsap
 *   - window.ScrollTrigger
 */
(function () {
    'use strict';

    // Bail out early if GSAP / ScrollTrigger failed to load (offline, blocked CDN)
    if (typeof window.gsap === 'undefined' || typeof window.ScrollTrigger === 'undefined') {
        return;
    }

    const gsap = window.gsap;
    const ScrollTrigger = window.ScrollTrigger;
    gsap.registerPlugin(ScrollTrigger);

    const section = document.querySelector('.services--scroll');
    if (!section) return;

    const grid = section.querySelector('.services__grid--scroll');
    const cells = gsap.utils.toArray(section.querySelectorAll('.services__cell'));
    const anchor = section.querySelector('.services__cell--anchor');
    if (!grid || !anchor || cells.length === 0) return;

    // Respect the OS-level reduced-motion preference.
    const reducedMotionMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

    // Cache the scroll trigger so we can kill/rebuild on resize.
    let activeAnimation = null;
    let activeTrigger = null;

    function buildAnimation() {
        // Tear down any previous instance so resize starts from a clean slate.
        if (activeAnimation) {
            activeAnimation.kill();
            activeAnimation = null;
        }
        if (activeTrigger) {
            activeTrigger.kill();
            activeTrigger = null;
        }

        // On tablet/mobile the pin layout is bypassed in CSS — skip the scroll
        // animation there too and just settle everything into place.
        const isMobileLayout = window.matchMedia('(max-width: 50rem)').matches;
        if (isMobileLayout || reducedMotionMQ.matches) {
            gsap.set(cells, { clearProps: 'transform,opacity,scale' });
            return;
        }

        // ---- Measure the anchor's centre point relative to the grid --------
        const gridWidth = grid.offsetWidth;
        const anchorWidth = anchor.offsetWidth;
        const anchorCenterX = anchor.offsetLeft + anchorWidth / 2;
        const anchorCenterY = anchor.offsetTop + anchor.offsetHeight / 2;

        // ---- Compute the initial cover scale for the anchor ---------------
        //      The anchor starts at 70% of the grid's width — large enough
        //      to overlap the outer cells in their parked (centred)
        //      position, but small enough to keep the visual focus on the
        //      image rather than blowing it out of the section.
        const coverScale = (gridWidth * 0.7) / anchorWidth;

        // ---- Park each outer cell on top of the anchor ---------------------
        const outerCells = cells.filter((cell) => cell !== anchor);
        outerCells.forEach((cell) => {
            const cellCenterX = cell.offsetLeft + cell.offsetWidth / 2;
            const cellCenterY = cell.offsetTop + cell.offsetHeight / 2;

            gsap.set(cell, {
                x: anchorCenterX - cellCenterX,
                y: anchorCenterY - cellCenterY,
                opacity: 1
            });
        });

        // ---- Park the anchor scaled up so it covers the whole grid ---------
        gsap.set(anchor, {
            x: 0,
            y: 0,
            scale: coverScale,
            transformOrigin: 'center center',
            opacity: 1
        });

        // ---- Build the scroll-driven timeline ------------------------------
        //      Outer cells slide back to their grid positions (staggered
        //      from the centre) while the anchor simultaneously shrinks
        //      from `coverScale` back to 1. Both tweens share the same
        //      duration so they finish together — the outer cells peel
        //      out from underneath the anchor exactly as it contracts.
        const staggerEach = 0.07;
        const outerDuration = 0.7;
        const totalDuration = outerDuration + (outerCells.length - 1) * staggerEach;

        const tl = gsap.timeline({
            scrollTrigger: {
                trigger: section,
                start: 'top top',
                end: 'bottom bottom',
                scrub: 0.5
            }
        });

        tl.to(outerCells, {
            x: 0,
            y: 0,
            duration: outerDuration,
            ease: 'power2.out',
            stagger: {
                each: staggerEach,
                from: 'center',
                grid: 'auto'
            }
        }, 0);

        tl.to(anchor, {
            scale: 1,
            duration: totalDuration,
            ease: 'power2.out'
        }, 0);

        activeAnimation = tl;
        activeTrigger = tl.scrollTrigger;
    }

    // Build once after the DOM is ready and again on resize (debounced).
    buildAnimation();

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(buildAnimation, 150);
    });

    // Refresh ScrollTrigger after every asset (esp. the anchor image) has
    // finished loading, so the trigger's start/end positions match the final
    // layout heights.
    window.addEventListener('load', () => ScrollTrigger.refresh());

    // React to reduced-motion changes without a page reload.
    if (typeof reducedMotionMQ.addEventListener === 'function') {
        reducedMotionMQ.addEventListener('change', buildAnimation);
    }
})();
