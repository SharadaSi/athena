// Vanilla JS: fetch posts from Sanity and hydrate Publications + homepage swiper
// - Query posts (newest first) for current locale
// - Replace Publications hero with newest post and keep originals as cards
// - Append remaining posts as dynamic cards
// - Swiper order fixed: [newest dynamic, CZU static, Data Banks static]

(function () {
  const PROJECT_ID = '8z0tbe2a';
  const DATASET = 'production';
  const API_VERSION = '2023-10-01';
  const isCzech = (typeof window !== 'undefined') && (window.location.pathname || '').includes('/cs/');
  const LOCALE = isCzech ? 'cs' : 'en';
  const articlePath = isCzech ? '/cs/article' : '/article';

  // Localized UI strings keyed by locale
  const UI_STRINGS = {
    en: { readMore: 'Read more', defaultReadTime: '5 min read' },
    cs: { readMore: 'Číst dál', defaultReadTime: '5 minut čtení' },
  };
  const ui = UI_STRINGS[LOCALE] || UI_STRINGS.en;

  function buildApiUrl(locale) {
    const groq = `*[_type=="post" && language == "${locale}"] | order(publishedAt desc){title,previewHeading,"slug":slug.current,author,readTime,publishedAt,"imageUrl":image.asset->url,body,perex}`;
    const q = encodeURIComponent(groq);
    return `https://${PROJECT_ID}.api.sanity.io/v${API_VERSION}/data/query/${DATASET}?query=${q}`;
  }

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    if (LOCALE === 'cs') {
      return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' });
    }
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

  function parseDateText(text) {
    if (!text) return null;
    const enMatch = text.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/);
    if (enMatch) {
      const day = Number(enMatch[1]);
      const monthName = enMatch[2].toLowerCase();
      const months = {
        january: 0,
        february: 1,
        march: 2,
        april: 3,
        may: 4,
        june: 5,
        july: 6,
        august: 7,
        september: 8,
        october: 9,
        november: 10,
        december: 11,
      };
      const month = months[monthName];
      const year = Number(enMatch[3]);
      if (month !== undefined && year) {
        const d = new Date(year, month, day);
        if (!Number.isNaN(d.getTime())) return d;
      }
    }

    const stripAccents = (s) => s.normalize('NFD').replace(/[^\w\s.]/g, '');
    const csMonths = {
      leden: 0, ledna: 0,
      unor: 1, unora: 1,
      brezen: 2, brezna: 2,
      duben: 3, dubna: 3,
      kveten: 4, kvetna: 4,
      cerven: 5, cervna: 5,
      cervenec: 6, cervence: 6,
      srpen: 7, srpna: 7,
      zari: 8,
      rijen: 9, rijna: 9,
      listopad: 10, listopadu: 10,
      prosinec: 11, prosince: 11,
    };
    const csMatch = text.match(/(\d{1,2})\.\s*([A-Za-zÁÉÍÓÚÝČĎĚŇŘŠŤŮŽáéíóúýčďěňřšťůž]+)\s+(\d{4})/);
    if (csMatch) {
      const day = Number(csMatch[1]);
      const monthKey = stripAccents(csMatch[2].toLowerCase());
      const month = csMonths[monthKey];
      const year = Number(csMatch[3]);
      if (month !== undefined && year) {
        const d = new Date(year, month, day);
        if (!Number.isNaN(d.getTime())) return d;
      }
    }
    return null;
  }

  function getCardDate(card) {
    const iso = card.getAttribute('data-published');
    if (iso) {
      const d = new Date(iso);
      if (!Number.isNaN(d.getTime())) return d;
    }
    const dateEl = card.querySelector('.features .date');
    const txt = dateEl ? dateEl.textContent : '';
    return parseDateText(txt) || new Date(0);
  }

  function snapshotHero(hero) {
    const imgEl = hero.querySelector('img');
    const titleEl = hero.querySelector('.article-preview-heading');
    const authorEl = hero.querySelector('.features .author');
    const dateEl = hero.querySelector('.features .date');
    const readEl = hero.querySelector('.features .read-time');
    const perexEl = hero.querySelector('.article-preview-text');
    const linkEl = hero.querySelector('a');
    return {
      imageUrl: imgEl ? imgEl.src : '',
      title: titleEl ? titleEl.textContent : '',
      author: authorEl ? authorEl.textContent : '',
      dateText: dateEl ? dateEl.textContent : '',
      readTimeText: readEl ? readEl.textContent : '',
      perex: perexEl ? perexEl.textContent : '',
      href: linkEl ? linkEl.href : '',
    };
  }

  function renderPublications(articles) {
    if (!articles.length) return;
    const grid = document.querySelector('.publishing-page--grid');
    const hero = document.querySelector('.publishing-page--grid__article.grid-item-1');
    if (!grid || !hero) return;

    const previousHero = snapshotHero(hero);
    const newest = articles[0];

    const imgEl = hero.querySelector('img');
    const authorEl = hero.querySelector('.features .author');
    const dateEl = hero.querySelector('.features .date');
    const readEl = hero.querySelector('.features .read-time');
    const titleEl = hero.querySelector('.article-preview-heading');
    const excerptEl = hero.querySelector('.article-preview-text');
    const linkBtn = hero.querySelector('a');
    if (imgEl && newest.imageUrl) imgEl.src = newest.imageUrl;
    if (titleEl) titleEl.textContent = newest.title || '';
    if (authorEl) authorEl.textContent = newest.author || 'CzechAlert';
    if (dateEl) dateEl.textContent = formatDate(newest.publishedAt);
    if (readEl) readEl.textContent = newest.readTime || readEl.textContent || ui.defaultReadTime;
    if (excerptEl) {
      const textFromPerex = newest.perex || '';
      const firstBlock = Array.isArray(newest.body) ? newest.body[0] : null;
      const textFromBody = firstBlock && Array.isArray(firstBlock.children)
        ? firstBlock.children.map((c) => c.text).join('')
        : '';
      excerptEl.textContent = textFromPerex || textFromBody || excerptEl.textContent || '';
    }
    if (linkBtn && newest.slug) linkBtn.href = `${articlePath}?slug=${newest.slug}`;

    grid.querySelectorAll('.grid-item.is-dynamic').forEach((el) => el.remove());

    for (let j = 1; j < articles.length; j++) {
      const a = articles[j];
      const card = document.createElement('div');
      card.className = 'publishing-page--grid__article grid-item is-dynamic';
      if (a.publishedAt) card.setAttribute('data-published', a.publishedAt);
      if (a.slug) card.setAttribute('data-slug', a.slug);

      const img = document.createElement('img');
      img.className = 'article-preview-img';
      if (a.imageUrl) img.src = a.imageUrl;
      img.alt = a.title || 'Article image';
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
      read.textContent = a.readTime || ui.defaultReadTime;
      features.appendChild(author);
      features.appendChild(date);
      features.appendChild(read);
      card.appendChild(features);

      const h2 = document.createElement('h2');
      h2.className = 'article-preview-heading';
      h2.textContent = a.title || '';
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
      link.className = 'btn btn--article';
      link.textContent = ui.readMore;
      card.appendChild(link);

      grid.appendChild(card);
    }

    if (previousHero && (previousHero.title || previousHero.imageUrl)) {
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
      read.textContent = previousHero.readTimeText || ui.defaultReadTime;
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
      link.className = 'btn btn--article';
      link.textContent = ui.readMore;
      card.appendChild(link);

      grid.appendChild(card);
    }

    const originalStatic = Array.from(
      grid.querySelectorAll('.publishing-page--grid__article.grid-item:not(.is-dynamic)')
    );
    const previousHeroCard = grid.querySelector('.publishing-page--grid__article.grid-item.previous-hero');
    const originalCards = previousHeroCard ? [...originalStatic, previousHeroCard] : originalStatic;
    const dynamicCards = Array.from(
      grid.querySelectorAll('.publishing-page--grid__article.grid-item.is-dynamic:not(.previous-hero)')
    );

    dynamicCards
      .map((card) => ({ card, date: getCardDate(card) }))
      .sort((a, b) => b.date - a.date)
      .forEach(({ card }) => grid.appendChild(card));

    originalCards
      .map((card) => ({ card, date: getCardDate(card) }))
      .sort((a, b) => b.date - a.date)
      .forEach(({ card }) => grid.appendChild(card));
  }

  function renderIndex(articles) {
    const slides = Array.from(
      document.querySelectorAll('.swiper .swiper-wrapper .swiper-slide')
    ).filter((s) => !s.classList.contains('swiper-slide-duplicate'));

    if (!slides.length) return;

    const count = Math.min(slides.length, articles.length);
    for (let i = 0; i < count; i++) {
      const slide = slides[i];
      const article = articles[i];
      const headingEl = slide.querySelector('.text-container--heading .heading-XXL');
      const buttonLink = slide.querySelector('.text-container a');
      const imgEl = slide.querySelector('.img-overlay-wrapper img.blog-img');
      if (headingEl && article.title) headingEl.textContent = article.title;
      if (buttonLink && article.slug) buttonLink.href = `${articlePath}?slug=${article.slug}`;
      if (imgEl && article.imageUrl) {
        imgEl.src = article.imageUrl;
        if (article.title) imgEl.alt = article.title;
      }
    }

    if (window.blogSwiper && typeof window.blogSwiper.update === 'function') {
      window.blogSwiper.update();
    }
  }

  async function run() {
    try {
      // `credentials: 'omit'` avoids Firefox Strict ETP / blocker heuristics that flag
      // credentialed cross-origin requests as tracking traffic (Sanity is a public dataset).
      const res1 = await fetch(buildApiUrl(LOCALE), { credentials: 'omit' });
      const json1 = await res1.json();
      let articles = Array.isArray(json1.result) ? json1.result : [];
      if (!articles.length && LOCALE !== 'en') {
        const res2 = await fetch(buildApiUrl('en'), { credentials: 'omit' });
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
