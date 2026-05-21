/* =============================================================================
 * pi-security-nebula.js
 *
 * Scroll-driven 3D model nested inside the first red curtain overlay on the
 * Private Investigations & Security page.
 *
 * Behaviour
 * ---------
 *   - Loads `media/network-nebula-3dmodel.glb` into a Three.js scene that
 *     renders into a canvas mounted inside `.service-panel__nebula` (which
 *     itself lives inside the first `.service-panel__overlay--red`).
 *   - The canvas fills the overlay, so the model travels with the curtain
 *     and is clipped to the overlay's bounds. As the curtain lifts off
 *     screen, the model lifts with it.
 *   - At rest the model sits in the top-left corner of its container.
 *   - Once the user scrolls past 70% of the viewport height (on the page
 *     scroll), a GSAP ScrollTrigger scrubs the model diagonally toward the
 *     bottom-right corner of the container, where it stays.
 *   - The model spins continuously around its own Y axis (plus a subtle
 *     X-axis wobble), independent of scroll.
 *   - Respects `prefers-reduced-motion`: no scroll animation, no spin.
 *
 * Stack
 * -----
 *   Three.js (ES modules via importmap in pr-security.html) + GSAP +
 *   ScrollTrigger (UMD on window, loaded earlier in the page).
 *
 * Coordinate strategy
 * -------------------
 *   The renderer is sized to the container (not the viewport), so a
 *   normalised offset of (-1, +1) maps cleanly to the container's
 *   top-left, and (+1, -1) maps to its bottom-right — exactly the corners
 *   the user requested. The model lives at z = 0 in world space; we
 *   convert container-relative normalised offsets into world units using
 *   the camera's vertical FOV.
 * ============================================================================= */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// -----------------------------------------------------------------------------
// Guard rails
// -----------------------------------------------------------------------------
const hostEl = document.querySelector('.service-panel__nebula');
if (!hostEl) {
    console.warn('[pr-security] `.service-panel__nebula` container missing — 3D scene disabled.');
} else if (typeof window.gsap === 'undefined' || typeof window.ScrollTrigger === 'undefined') {
    console.warn('[pr-security] GSAP / ScrollTrigger unavailable — 3D scene disabled.');
} else {
    initNebulaScene(hostEl);
}

function initNebulaScene(host) {
    const gsap = window.gsap;
    const ScrollTrigger = window.ScrollTrigger;
    gsap.registerPlugin(ScrollTrigger);

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // -------------------------------------------------------------------------
    // Renderer — sized to the host container, NOT the viewport
    // -------------------------------------------------------------------------
    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,                 // transparent — overlay colour shows through
        powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    host.appendChild(renderer.domElement);

    // Belt-and-braces canvas sizing — Three.js sets the drawing-buffer
    // size via the canvas `width`/`height` HTML attributes; we force
    // inline CSS too so the canvas always fills the host visually,
    // regardless of stylesheet load order or specificity collisions.
    Object.assign(renderer.domElement.style, {
        display: 'block',
        width: '100%',
        height: '100%',
        position: 'absolute',
        top: '0',
        left: '0',
    });

    // Initial size — falls back to 1×1 if the host is somehow zero-sized.
    // The ResizeObserver below will resize as soon as layout settles.
    const initialRect = host.getBoundingClientRect();
    let cw = Math.max(1, initialRect.width);
    let ch = Math.max(1, initialRect.height);
    renderer.setSize(cw, ch, false);

    // -------------------------------------------------------------------------
    // Scene + camera
    // -------------------------------------------------------------------------
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(45, cw / ch, 0.1, 100);
    camera.position.set(0, 0, 8);

    // -------------------------------------------------------------------------
    // Lighting
    // -------------------------------------------------------------------------
    scene.add(new THREE.AmbientLight(0xffffff, 0.7));

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(4, 6, 5);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x6aa9ff, 0.6);
    rimLight.position.set(-5, -2, 3);
    scene.add(rimLight);

    // -------------------------------------------------------------------------
    // Holder group — translate the model independently of any internal
    // transforms applied by the GLB itself.
    // -------------------------------------------------------------------------
    const modelHolder = new THREE.Group();
    scene.add(modelHolder);

    // -------------------------------------------------------------------------
    // Map container-relative normalised offsets → world coordinates at z = 0
    //   nx ∈ [-1, +1]  -1 = container left edge,  +1 = container right edge
    //   ny ∈ [-1, +1]  +1 = container top edge,   -1 = container bottom edge
    // -------------------------------------------------------------------------
    function viewportToWorld(nx, ny) {
        const distance = camera.position.z;
        const vFov = THREE.MathUtils.degToRad(camera.fov);
        const worldHeight = 2 * Math.tan(vFov / 2) * distance;
        const worldWidth = worldHeight * camera.aspect;
        return {
            x: (nx * worldWidth) / 2,
            y: (ny * worldHeight) / 2,
        };
    }

    // Visible world half-extents at the model's depth — handy for clamping
    // the model's centre so its bounding sphere never spills past the edge.
    function getWorldHalfExtents() {
        const distance = camera.position.z;
        const vFov = THREE.MathUtils.degToRad(camera.fov);
        const halfH = Math.tan(vFov / 2) * distance;
        const halfW = halfH * camera.aspect;
        return { halfW, halfH };
    }

    // Padding (in world units) between the model's bounding sphere and the
    // container edge so the corners look intentional, not flush.
    const EDGE_PADDING = 0.25;

    // Computed after the model loads — radius of the model's bounding
    // sphere in world units. Used to keep the model fully inside the
    // container at both corners.
    let modelRadius = 0;

    function getCornerPositions() {
        const { halfW, halfH } = getWorldHalfExtents();
        // Pull the centre in by exactly the bounding-sphere radius plus a
        // small padding, so the model's outer edge sits `EDGE_PADDING`
        // away from the container edge regardless of container size.
        const insetX = Math.max(0, halfW - modelRadius - EDGE_PADDING);
        const insetY = Math.max(0, halfH - modelRadius - EDGE_PADDING);
        return {
            topLeft: { x: -insetX, y: +insetY },
            bottomRight: { x: +insetX, y: -insetY },
        };
    }

    // Track the scroll tween so resize can update its end values.
    let scrollTween = null;

    // -------------------------------------------------------------------------
    // Load the GLB
    // -------------------------------------------------------------------------
    const loader = new GLTFLoader();
    loader.load(
        'media/network-nebula-3dmodel.glb',
        (gltf) => {
            const model = gltf.scene;

            // Normalise size — fit the longest axis to a target world size.
            // Tuned against the container's shortest visible world extent so
            // the model reads as a confident hero element without overflowing
            // narrow containers.
            const TARGET_SIZE = 10;
            const bbox = new THREE.Box3().setFromObject(model);
            const size = new THREE.Vector3();
            bbox.getSize(size);
            const longest = Math.max(size.x, size.y, size.z) || 1;
            model.scale.setScalar(TARGET_SIZE / longest);

            // Recentre so rotations spin around the model's centre.
            const centre = new THREE.Vector3();
            new THREE.Box3().setFromObject(model).getCenter(centre);
            model.position.sub(centre);

            modelHolder.add(model);

            // Measure the bounding sphere of the centred, scaled model.
            // This radius is what we inset the corner anchors by, so the
            // model's outermost point always lands inside the container
            // (minus EDGE_PADDING) regardless of container size.
            const sphere = new THREE.Sphere();
            new THREE.Box3().setFromObject(modelHolder).getBoundingSphere(sphere);
            modelRadius = sphere.radius;

            // Park in the top-left corner of the container.
            const { topLeft, bottomRight } = getCornerPositions();
            modelHolder.position.set(topLeft.x, topLeft.y, 0);

            // Wire up the scroll-driven diagonal travel.
            if (!prefersReducedMotion) {
                scrollTween = gsap.to(modelHolder.position, {
                    x: bottomRight.x,
                    y: bottomRight.y,
                    ease: 'none',
                    scrollTrigger: {
                        // Page scroll, not curtain-relative — kicks in once
                        // the user has scrolled 70% of one viewport height.
                        trigger: document.documentElement,
                        start: '70% top',
                        end: '+=120%',
                        scrub: true,
                        invalidateOnRefresh: true,
                    },
                });
            }

            ScrollTrigger.refresh();
        },
        undefined,
        (err) => {
            console.error('[pr-security] Failed to load network-nebula-3dmodel.glb', err);
        }
    );

    // -------------------------------------------------------------------------
    // Render loop — continuous self-rotation + draw
    // -------------------------------------------------------------------------
    const clock = new THREE.Clock();
    function tick() {
        const dt = clock.getDelta();

        if (!prefersReducedMotion) {
            modelHolder.rotation.y += dt * 0.6;
            modelHolder.rotation.x += dt * 0.15;
        }

        renderer.render(scene, camera);
        requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    // -------------------------------------------------------------------------
    // Keep renderer + camera + corner mapping in sync with container size.
    // ResizeObserver covers both window resizes and layout shifts caused
    // by the curtain animation.
    // -------------------------------------------------------------------------
    const ro = new ResizeObserver(() => {
        const rect = host.getBoundingClientRect();
        const w = Math.max(1, rect.width);
        const h = Math.max(1, rect.height);
        if (w === cw && h === ch) return;
        cw = w;
        ch = h;
        renderer.setSize(cw, ch, false);
        camera.aspect = cw / ch;
        camera.updateProjectionMatrix();

        const { topLeft, bottomRight } = getCornerPositions();
        if (scrollTween) {
            const st = scrollTween.scrollTrigger;
            const progress = st ? st.progress : 0;
            scrollTween.vars.x = bottomRight.x;
            scrollTween.vars.y = bottomRight.y;
            scrollTween.invalidate();
            // Reapply current progress so the model sits at the correct
            // interpolated point along the new diagonal.
            modelHolder.position.set(
                THREE.MathUtils.lerp(topLeft.x, bottomRight.x, progress),
                THREE.MathUtils.lerp(topLeft.y, bottomRight.y, progress),
                0
            );
        } else if (modelHolder.children.length) {
            modelHolder.position.set(topLeft.x, topLeft.y, 0);
        }
    });
    ro.observe(host);
}
