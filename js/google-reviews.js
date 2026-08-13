/* =============================================================================
 * google-reviews.js
 *
 * Renders the native CzechAlert "Google Reviews" testimonials widget.
 *
 * It fetches a small, pre-normalised JSON payload from our own PHP proxy
 * (php/google-reviews.php) — the Google API key stays on the server — and
 * builds the review cards with the DOM API. All review text is inserted via
 * `textContent`, never `innerHTML`, so nothing a reviewer typed can inject
 * markup into the page.
 *
 * The widget is configured entirely through data-* attributes on its mount
 * element, so the EN and CS homepages can reuse this one script while keeping
 * their own copy (endpoint path, language, labels) local to each page:
 *
 *   <div class="reviews" id="reviews-widget"
 *        data-endpoint="php/google-reviews.php"
 *        data-lang="en"
 *        data-profile-url="https://..."
 *        data-label-count="Based on {n} Google reviews"
 *        data-label-empty="Reviews are on their way."
 *        data-label-more="Read more"
 *        data-label-less="Show less"
 *        data-label-verified="Posted on Google"></div>
 *
 * Failure is silent-but-graceful: if the proxy is unreachable (e.g. the local
 * static dev server has no PHP) the widget shows a short fallback line linking
 * to the Google profile instead of a broken/empty box.
 * ========================================================================== */

(function initGoogleReviews() {
    const mount = document.getElementById('reviews-widget');
    if (!mount) return;

    // ---- Config from data-* attributes (with sensible fallbacks) -----------
    const cfg = {
        endpoint: mount.dataset.endpoint || 'php/google-reviews.php',
        lang: mount.dataset.lang || 'en',
        profileUrl: mount.dataset.profileUrl || '',
        labelCount: mount.dataset.labelCount || '{n} reviews',
        labelEmpty: mount.dataset.labelEmpty || '',
        labelMore: mount.dataset.labelMore || 'Read more',
        labelLess: mount.dataset.labelLess || 'Show less',
        labelVerified: mount.dataset.labelVerified || 'Posted on Google',
        labelProfile: mount.dataset.labelProfile || 'See all reviews on Google',
    };

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Small inline "G" Google glyph, reused on the summary and each card.
    function googleGlyph() {
        const NS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', '0 0 48 48');
        svg.setAttribute('class', 'reviews__google-glyph');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        const paths = [
            ['#4285F4', 'M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z'],
            ['#34A853', 'M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z'],
            ['#FBBC05', 'M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z'],
            ['#EA4335', 'M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z'],
        ];
        for (const [fill, d] of paths) {
            const p = document.createElementNS(NS, 'path');
            p.setAttribute('fill', fill);
            p.setAttribute('d', d);
            svg.appendChild(p);
        }
        return svg;
    }

    // Build an accessible star row for a given rating (0–5).
    function starRow(rating) {
        const NS = 'http://www.w3.org/2000/svg';
        const wrap = document.createElement('span');
        wrap.className = 'reviews__stars';
        const rounded = Math.round(rating);
        wrap.setAttribute('role', 'img');
        wrap.setAttribute('aria-label', `${rating} / 5`);
        for (let i = 1; i <= 5; i++) {
            const star = document.createElementNS(NS, 'svg');
            star.setAttribute('viewBox', '0 0 24 24');
            star.setAttribute('aria-hidden', 'true');
            star.setAttribute('focusable', 'false');
            star.setAttribute(
                'class',
                'reviews__star' + (i <= rounded ? ' reviews__star--on' : '')
            );
            const p = document.createElementNS(NS, 'path');
            p.setAttribute(
                'd',
                'M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z'
            );
            star.appendChild(p);
            wrap.appendChild(star);
        }
        return wrap;
    }

    // A round avatar: the Google photo when present, otherwise the author's
    // initial on a tinted disc (photos occasionally 403 / fail to load).
    function avatar(author, src) {
        const el = document.createElement('div');
        el.className = 'reviews__avatar';
        const initial = (author || '?').trim().charAt(0).toUpperCase();
        el.textContent = initial;
        if (src) {
            const img = new Image();
            img.loading = 'lazy';
            img.decoding = 'async';
            img.alt = '';
            img.referrerPolicy = 'no-referrer';
            img.onload = () => {
                el.textContent = '';
                el.appendChild(img);
            };
            img.src = src;
        }
        return el;
    }

    function renderSummary(data) {
        const summary = document.createElement('div');
        summary.className = 'reviews__summary';

        if (typeof data.rating === 'number') {
            const score = document.createElement('span');
            score.className = 'reviews__summary-score';
            score.textContent = data.rating.toFixed(1);
            summary.appendChild(score);
        }

        summary.appendChild(starRow(data.rating || 0));

        const count = document.createElement('span');
        count.className = 'reviews__summary-count';
        count.textContent = cfg.labelCount.replace('{n}', data.ratingCount || 0);
        summary.appendChild(count);

        const href = data.profileUrl || cfg.profileUrl;
        if (href) {
            const link = document.createElement('a');
            link.className = 'reviews__summary-link';
            link.href = href;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.appendChild(googleGlyph());
            const span = document.createElement('span');
            span.textContent = cfg.labelProfile;
            link.appendChild(span);
            summary.appendChild(link);
        }
        return summary;
    }

    function renderCard(review) {
        const card = document.createElement('li');
        card.className = 'reviews__card';

        const head = document.createElement('div');
        head.className = 'reviews__card-head';
        head.appendChild(avatar(review.author, review.avatar));

        const meta = document.createElement('div');
        meta.className = 'reviews__card-meta';
        const name = document.createElement('span');
        name.className = 'reviews__author';
        name.textContent = review.author || 'Google user';
        meta.appendChild(name);
        if (review.time) {
            const time = document.createElement('span');
            time.className = 'reviews__time';
            time.textContent = review.time;
            meta.appendChild(time);
        }
        head.appendChild(meta);

        const glyph = googleGlyph();
        glyph.classList.add('reviews__card-google');
        const glyphTitle = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        glyphTitle.textContent = cfg.labelVerified;
        glyph.setAttribute('aria-hidden', 'false');
        glyph.setAttribute('role', 'img');
        glyph.insertBefore(glyphTitle, glyph.firstChild);
        head.appendChild(glyph);

        card.appendChild(head);
        card.appendChild(starRow(review.rating || 0));

        const text = document.createElement('p');
        text.className = 'reviews__text';
        text.textContent = review.text || '';
        card.appendChild(text);

        // Show a "Read more" toggle only when the text is actually clamped.
        // Measured after paint so scrollHeight/clientHeight are meaningful.
        requestAnimationFrame(() => {
            if (text.scrollHeight - text.clientHeight > 4) {
                const toggle = document.createElement('button');
                toggle.type = 'button';
                toggle.className = 'reviews__more';
                toggle.textContent = cfg.labelMore;
                toggle.setAttribute('aria-expanded', 'false');
                toggle.addEventListener('click', () => {
                    const open = text.classList.toggle('reviews__text--open');
                    toggle.textContent = open ? cfg.labelLess : cfg.labelMore;
                    toggle.setAttribute('aria-expanded', String(open));
                });
                card.appendChild(toggle);
            }
        });

        return card;
    }

    function render(data) {
        mount.classList.remove('reviews--loading');

        const hasReviews = Array.isArray(data.reviews) && data.reviews.length > 0;
        if (!hasReviews) {
            renderFallback();
            return;
        }

        const inner = document.createElement('div');
        inner.className = 'reviews__inner';
        inner.appendChild(renderSummary(data));

        const list = document.createElement('ul');
        list.className = 'reviews__list';
        data.reviews.forEach((review, i) => {
            const card = renderCard(review);
            if (!reduceMotion) {
                card.style.setProperty('--reviews-delay', `${i * 70}ms`);
                card.classList.add('reviews__card--enter');
            }
            list.appendChild(card);
        });
        inner.appendChild(list);

        mount.replaceChildren(inner);
    }

    // Minimal, dignified fallback: a single line linking to the Google profile.
    function renderFallback() {
        mount.classList.remove('reviews--loading');
        const href = cfg.profileUrl;
        const box = document.createElement('div');
        box.className = 'reviews__fallback';

        if (cfg.labelEmpty) {
            const p = document.createElement('p');
            p.textContent = cfg.labelEmpty;
            box.appendChild(p);
        }
        if (href) {
            const link = document.createElement('a');
            link.className = 'reviews__summary-link';
            link.href = href;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.appendChild(googleGlyph());
            const span = document.createElement('span');
            span.textContent = cfg.labelProfile;
            link.appendChild(span);
            box.appendChild(link);
        }
        mount.replaceChildren(box);
    }

    // Skeleton placeholders keep the section height stable while we fetch.
    function renderSkeleton() {
        mount.classList.add('reviews--loading');
        const list = document.createElement('ul');
        list.className = 'reviews__list';
        for (let i = 0; i < 3; i++) {
            const card = document.createElement('li');
            card.className = 'reviews__card reviews__card--skeleton';
            card.setAttribute('aria-hidden', 'true');
            list.appendChild(card);
        }
        mount.replaceChildren(list);
    }

    // ---- Kick things off ---------------------------------------------------
    renderSkeleton();

    const url = `${cfg.endpoint}?lang=${encodeURIComponent(cfg.lang)}`;
    fetch(url, { headers: { Accept: 'application/json' } })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error('HTTP ' + res.status))))
        .then((data) => render(data || {}))
        .catch((err) => {
            console.warn('[google-reviews] Falling back — could not load reviews:', err);
            renderFallback();
        });
})();
