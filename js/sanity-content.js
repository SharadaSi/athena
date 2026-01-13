// Vanilla JS: Fetch posts from Sanity and render into existing HTML
// Works without frameworks; uses public dataset read via GROQ HTTP API
// Key responsibilities:
// - Query Sanity posts (newest first)
// - Replace Publications hero with the newest post
// - Keep original static cards, append dynamic cards for extra posts
// - Re-add the original hero as a normal card so legacy content remains
// - Sort originals newest→oldest, then dynamic cards

(function () {
  // --- Sanity API configuration (project, dataset, API version, query) ---
  const PROJECT_ID = '8z0tbe2a';
  const DATASET = 'production';
  const API_VERSION = '2023-10-01';
  // Locale detection from URL path: '/cs/' → 'cs', else 'en'
  const isCzech = (typeof window !== 'undefined') && (window.location.pathname || '').includes('/cs/');
  const LOCALE = isCzech ? 'cs' : 'en';
  const articlePath = isCzech ? 'cs/article.html' : 'article.html';

  // Build GROQ per locale
  function buildApiUrl(locale) {
    const groq = `*[_type=="post" && language == "${locale}"] | order(publishedAt desc){title,previewHeading,"slug":slug.current,author,readTime,publishedAt,"imageUrl":image.asset->url,body,perex}`;
    const q = encodeURIComponent(groq);
    return `https://${PROJECT_ID}.api.sanity.io/v${API_VERSION}/data/query/${DATASET}?query=${q}`;
  }

  // Format ISO date (YYYY-MM-DD) to "6th December 2025" with ordinal suffixes
  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const day = d.getDate();
    const month = d.toLocaleString('en-US', { month: 'long' });
    const year = d.getFullYear();
    const suffix = (n) => {
      if (n % 10 === 1 && n !== 11) return 'st';
      if (n % 10 === 2 && n !== 12) return 'nd';
      if (n % 10 === 3 && n !== 13) return 'rd';
      return 'th';
    };
    return `${day}${suffix(day)} ${month} ${year}`;
  }

  // Render Publications page:
  // 1) Replace hero with newest Sanity post
  // 2) Append dynamic cards for remaining posts
  // 3) Re-add the original hero as a card (preserve legacy 4)
  // 4) Sort original cards newest→oldest, then dynamic cards
  function renderPublications(articles) {
    const hero = document.querySelector('.publishing-page--grid__article.grid-item-1');

    // Snapshot the original hero so we can re-add it as a grid card
    let previousHero = null;
    if (hero) {
      // Capture current hero state from static HTML
      const hImg = hero.querySelector('img.main-article-preview-img');
      const hAuthor = hero.querySelector('.features .author');
      const hDate = hero.querySelector('.features .date');
      const hRead = hero.querySelector('.features .read-time');
      const hTitle = hero.querySelector('.article-preview-heading');
      const hExcerpt = hero.querySelector('.article-preview-text');
      const hLink = hero.querySelector('a');
      previousHero = {
        imageUrl: hImg?.src || '',
        author: hAuthor?.textContent || 'CzechAlert',
        // keep already formatted date text from static HTML
        dateText: hDate?.textContent || '',
        readTimeText: hRead?.textContent || '5 min read',
        title: hTitle?.textContent || '',
        perex: hExcerpt?.textContent || '',
        href: hLink?.getAttribute('href') || '#'
      };
    }

    if (hero && articles[0]) {
      // Newest post becomes the hero
      const a = articles[0];
      const imgEl = hero.querySelector('img.main-article-preview-img');
      const authorEl = hero.querySelector('.features .author');
      const dateEl = hero.querySelector('.features .date');
      const readEl = hero.querySelector('.features .read-time');
      const titleEl = hero.querySelector('.article-preview-heading');
      const excerptEl = hero.querySelector('.article-preview-text');
      const linkBtn = hero.querySelector('a');
      if (imgEl && a.imageUrl) imgEl.src = a.imageUrl;
      if (titleEl) titleEl.textContent = a.previewHeading || a.title || '';
      if (authorEl) authorEl.textContent = a.author || 'CzechAlert';
      if (dateEl) dateEl.textContent = formatDate(a.publishedAt);
      if (readEl) readEl.textContent = a.readTime || readEl.textContent || '5 min read';
      if (excerptEl) {
        // Prefer perex; fallback to first Portable Text block
        const textFromPerex = a.perex || '';
        const firstBlock = Array.isArray(a.body) ? a.body[0] : null;
        const textFromBody = firstBlock && Array.isArray(firstBlock.children)
          ? firstBlock.children.map((c) => c.text).join('')
          : '';
        excerptEl.textContent = textFromPerex || textFromBody || excerptEl.textContent || '';
      }
      if (linkBtn && a.slug) linkBtn.href = `${articlePath}?slug=${a.slug}`;
    }

    const grid = document.querySelector('.publishing-page--grid');
    if (!grid) return;

    // Clear previously appended dynamic cards to avoid duplicates on re-render
    grid.querySelectorAll('.grid-item.is-dynamic').forEach((el) => el.remove());

    // Append a card for every additional post (keep existing static cards untouched)
    for (let j = 1; j < articles.length; j++) {
      // Create dynamic card for article j (beyond hero)
      const a = articles[j];
      const card = document.createElement('div');
      card.className = 'publishing-page--grid__article grid-item is-dynamic';
      // Store metadata for sorting/filtering
      if (a.publishedAt) card.setAttribute('data-published', a.publishedAt);
      if (a.slug) card.setAttribute('data-slug', a.slug);

      const img = document.createElement('img');
      img.className = 'article-preview-img';
      if (a.imageUrl) img.src = a.imageUrl;
      img.alt = a.previewHeading || a.title || 'Article image';
      card.appendChild(img);

      const features = document.createElement('div');
      features.className = 'features';
      const author = document.createElement('span');
      author.className = 'author';
      author.textContent = a.author || 'CzechAlert';
      const date = document.createElement('span');
      date.className = 'date';
      date.textContent = formatDate(a.publishedAt);
      const read = document.createElement('span');
      read.className = 'read-time';
      read.textContent = a.readTime || '5 min read';
      features.appendChild(author);
      features.appendChild(date);
      features.appendChild(read);
      card.appendChild(features);

      const h2 = document.createElement('h2');
      h2.className = 'article-preview-heading';
      h2.textContent = a.previewHeading || a.title || '';
      card.appendChild(h2);

      const p = document.createElement('p');
      p.className = 'article-preview-text';
      const firstBlock = Array.isArray(a.body) ? a.body[0] : null;
      const bodyText = firstBlock && Array.isArray(firstBlock.children)
        ? firstBlock.children.map((c) => c.text).join('')
        : '';
      p.textContent = a.perex || bodyText || '';
      card.appendChild(p);

      const link = document.createElement('a');
      link.href = a.slug ? `${articlePath}?slug=${a.slug}` : '#';
      const btn = document.createElement('button');
      btn.className = 'btn btn--article';
      btn.textContent = 'Read more';
      link.appendChild(btn);
      card.appendChild(link);

      grid.appendChild(card);
    }

    // Re-add the original hero as the last card so all 4 originals remain visible
    if (previousHero) {
      // Convert snapped hero into a normal grid card and append
      const card = document.createElement('div');
      card.className = 'publishing-page--grid__article grid-item is-dynamic previous-hero';
      card.setAttribute('data-origin', 'previous-hero');

      const img = document.createElement('img');
      img.className = 'article-preview-img';
      if (previousHero.imageUrl) img.src = previousHero.imageUrl;
      img.alt = previousHero.title || 'Article image';
      card.appendChild(img);

      const features = document.createElement('div');
      features.className = 'features';
      const author = document.createElement('span');
      author.className = 'author';
      author.textContent = previousHero.author || 'CzechAlert';
      const date = document.createElement('span');
      date.className = 'date';
      date.textContent = previousHero.dateText || '';
      const read = document.createElement('span');
      read.className = 'read-time';
      read.textContent = previousHero.readTimeText || '5 min read';
      features.appendChild(author);
      features.appendChild(date);
      features.appendChild(read);
      card.appendChild(features);

      const h2 = document.createElement('h2');
      h2.className = 'article-preview-heading';
      h2.textContent = previousHero.title || '';
      card.appendChild(h2);

      const p = document.createElement('p');
      p.className = 'article-preview-text';
      p.textContent = previousHero.perex || '';
      card.appendChild(p);

      const link = document.createElement('a');
      link.href = previousHero.href || '#';
      const btn = document.createElement('button');
      btn.className = 'btn btn--article';
      btn.textContent = 'Read more';
      link.appendChild(btn);
      card.appendChild(link);

      grid.appendChild(card);
    }

    // --- Sorting: dynamic cards first (newest→oldest), then originals ---
    const parseDateText = (text) => {
      if (!text) return null;
      const cleaned = text.replace(/(\d+)(st|nd|rd|th)/i, '$1');
      const d = new Date(cleaned);
      return isNaN(d.getTime()) ? null : d;
    };

    const getCardDate = (card) => {
      // Prefer ISO stored in data-published; fallback to human-readable text
      const iso = card.getAttribute('data-published');
      if (iso) {
        const d = new Date(iso);
        if (!isNaN(d.getTime())) return d;
      }
      const dateEl = card.querySelector('.features .date');
      const txt = dateEl ? dateEl.textContent : '';
      return parseDateText(txt) || new Date(0);
    };

    const originalStatic = Array.from(
      grid.querySelectorAll('.publishing-page--grid__article.grid-item:not(.is-dynamic)')
    );
    const previousHeroCard = grid.querySelector('.publishing-page--grid__article.grid-item.previous-hero');
    const originalCards = previousHeroCard ? [...originalStatic, previousHeroCard] : originalStatic;
    const dynamicCards = Array.from(
      grid.querySelectorAll('.publishing-page--grid__article.grid-item.is-dynamic:not(.previous-hero)')
    );

    // 1) Append dynamic cards sorted DESC (newest to oldest)
    dynamicCards
      .map((card) => ({ card, date: getCardDate(card) }))
      .sort((a, b) => b.date - a.date)
      .forEach(({ card }) => grid.appendChild(card));

    // 2) Then append original cards sorted DESC (newest to oldest)
    originalCards
      .map((card) => ({ card, date: getCardDate(card) }))
      .sort((a, b) => b.date - a.date)
      .forEach(({ card }) => grid.appendChild(card));
  }

  // Render homepage swiper slides: 1=newest dynamic, 2=second newest dynamic, 3=static CZU lecture
  function renderIndex(articles) {
    // Filter out Swiper's duplicate slides (loop clones) to target original three
    const slides = Array.from(
      document.querySelectorAll('.swiper .swiper-wrapper .swiper-slide')
    ).filter((s) => !s.classList.contains('swiper-slide-duplicate'));

    if (!slides.length) return;

    // Snapshot existing static slide content BEFORE we modify anything,
    // so we can choose the newest static by date for slide 3.
    const staticSnapshots = slides.map((s) => {
      const headingEl = s.querySelector('.text-container--heading .heading-XXL');
      const buttonLink = s.querySelector('.text-container a');
      const imgEl = s.querySelector('.img-overlay-wrapper img.blog-img');
      const dateEl = s.querySelector('.features .date');
      return {
        heading: headingEl ? headingEl.textContent : '',
        href: buttonLink ? buttonLink.href : '',
        imgSrc: imgEl ? imgEl.src : '',
        dateText: dateEl ? dateEl.textContent : '',
      };
    });

    const parseDateText = (text) => {
      if (!text) return null;
      const cleaned = text.replace(/(\d+)(st|nd|rd|th)/i, '$1');
      const d = new Date(cleaned);
      return isNaN(d.getTime()) ? null : d;
    };

    // Pick newest static snapshot by date
    const newestStatic = staticSnapshots
      .map((snap) => ({ snap, date: parseDateText(snap.dateText) || new Date(0) }))
      .sort((a, b) => b.date - a.date)[0]?.snap;

    // Slide 1: newest dynamic article
    const slide1 = slides[0];
    const newest = articles[0];
    if (slide1 && newest) {
      const headingEl = slide1.querySelector('.text-container--heading .heading-XXL');
      const buttonLink = slide1.querySelector('.text-container a');
      const imgEl = slide1.querySelector('.img-overlay-wrapper img.blog-img');
      if (headingEl) headingEl.textContent = newest.previewHeading || newest.title || headingEl.textContent || '';
      if (buttonLink) buttonLink.href = newest.slug ? `article.html?slug=${newest.slug}` : buttonLink.href;
      if (imgEl && newest.imageUrl) imgEl.src = newest.imageUrl;
    }

    // Slide 2: previous newest dynamic article (second newest)
    const slide2 = slides[1];
    const previousNewest = articles[1];
    if (slide2 && previousNewest) {
      const headingEl = slide2.querySelector('.text-container--heading .heading-XXL');
      const buttonLink = slide2.querySelector('.text-container a');
      const imgEl = slide2.querySelector('.img-overlay-wrapper img.blog-img');
      if (headingEl) headingEl.textContent = previousNewest.previewHeading || previousNewest.title || headingEl.textContent || '';
      if (buttonLink) buttonLink.href = previousNewest.slug ? `article.html?slug=${previousNewest.slug}` : buttonLink.href;
      if (imgEl && previousNewest.imageUrl) imgEl.src = previousNewest.imageUrl;
    }

    // Slide 3: set to newest static by date (e.g., CZU lecture)
    const slide3 = slides[2];
    if (slide3 && newestStatic) {
      const headingEl = slide3.querySelector('.text-container--heading .heading-XXL');
      const buttonLink = slide3.querySelector('.text-container a');
      const imgEl = slide3.querySelector('.img-overlay-wrapper img.blog-img');
      if (headingEl && newestStatic.heading) headingEl.textContent = newestStatic.heading;
      if (buttonLink && newestStatic.href) buttonLink.href = newestStatic.href;
      if (imgEl && newestStatic.imgSrc) imgEl.src = newestStatic.imgSrc;
    }
  }

  // Fetch posts and hydrate Publications + Index
  async function run() {
    try {
      // Try locale-specific first; fallback to 'en' if none for 'cs'
      const res1 = await fetch(buildApiUrl(LOCALE));
      const json1 = await res1.json();
      let articles = Array.isArray(json1.result) ? json1.result : [];
      if (!articles.length && LOCALE !== 'en') {
        const res2 = await fetch(buildApiUrl('en'));
        const json2 = await res2.json();
        articles = Array.isArray(json2.result) ? json2.result : [];
      }
      if (!articles.length) return;
      renderPublications(articles);
      renderIndex(articles);
    } catch (e) {
      console.error('Sanity fetch failed', e);
    }
  }

  // Run when DOM is ready; if already loaded, run immediately
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
