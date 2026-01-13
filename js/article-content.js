// Dynamic article renderer: fetch a single post by slug and populate the page
// Responsibilities:
// - Parse slug from URL (article.html?slug=...)
// - Fetch one Sanity post via GROQ HTTP API
// - Render title, image, perex/first paragraph, remaining body paragraphs
// - Render resources as numbered external links

(function () {
  // --- Sanity project configuration for HTTP API ---
  const PROJECT_ID = '8z0tbe2a';
  const DATASET = 'production';
  const API_VERSION = '2023-10-01';
  const isCzech = (typeof window !== 'undefined') && (window.location.pathname || '').includes('/cs/');
  const LOCALE = isCzech ? 'cs' : 'en';

  // Read the `slug` query parameter from current URL
  function getSlug() {
    const params = new URLSearchParams(window.location.search);
    return params.get('slug');
  }

  // Format ISO date to "6th December 2025" (ordinal suffixes)
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

  // Convert Sanity Portable Text blocks to plain text paragraphs
  // Joins child spans; splits on blank lines to preserve paragraph breaks
  function blocksToParagraphs(blocks) {
    if (!Array.isArray(blocks)) return [];
    const paragraphs = [];
    for (const b of blocks) {
      if (!b || b._type !== 'block' || !Array.isArray(b.children)) continue;
      const plain = b.children.map((c) => c.text || '').join('');
      // Split on blank lines to respect paragraph breaks within a single block
      const parts = plain
        .split(/\n\s*\n+/)
        .map((s) => s.trim())
        .filter(Boolean);
      paragraphs.push(...parts);
    }
    return paragraphs;
  }

  // Render a single article document into page elements
  function renderArticle(doc) {
    const titleEl = document.querySelector('.article-page--heading');
    const imgEl = document.querySelector('.article-page--content-img');
    const firstParaEl = document.querySelector('.first-paragraph');
    const bodyContainer = document.getElementById('article-body');
    const resourcesContainer = document.getElementById('article-resources');
    const resourcesList = document.getElementById('article-resources-list');

    // Title and main image
    if (titleEl) titleEl.textContent = doc.title || '';
    if (imgEl && doc.imageUrl) imgEl.src = doc.imageUrl;

    // First paragraph (prefer explicit perex, fallback to first body paragraph)
    const paras = blocksToParagraphs(doc.body);
    const first = doc.perex || paras.shift() || '';
    if (firstParaEl) firstParaEl.textContent = first;

    // Remaining body paragraphs
    if (bodyContainer) {
      const rest = doc.perex ? paras : paras; // if perex provided, still render all body paragraphs
      for (const text of rest) {
        const p = document.createElement('p');
        p.className = 'article-page--content-p other-paragraphs';
        p.textContent = text;
        bodyContainer.appendChild(p);
      }
    }

    // Render resources if present (numbered links)
    const resources = Array.isArray(doc.resources) ? doc.resources : [];
    if (resources.length && resourcesContainer && resourcesList) {
      resourcesContainer.style.display = '';
      resourcesList.innerHTML = '';
      resources.forEach((r, i) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        const label = (r.label || r.url || '').trim();
        a.href = r.url || '#';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = `${i + 1}. ${label}`;
        li.appendChild(a);
        resourcesList.appendChild(li);
      });
    }
  }

  // Fetch article by slug via GROQ HTTP API and render
  async function run() {
    const slug = getSlug();
    const path = window.location.pathname || '';
    const isArticleTemplate = /\/(?:cs\/)?article\.html$/i.test(path);
    // Only enforce redirect when using the dynamic article template.
    // Static pages that include this script should not be redirected.
    if (!slug && isArticleTemplate) {
      window.location.href = 'publications.html';
      return;
    }
    const buildUrl = (locale) => {
      const groq = `*[_type=="post" && language == "${locale}" && slug.current=="${slug}"][0]{title,previewHeading,perex,readTime,"slug":slug.current,author,publishedAt,"imageUrl":image.asset->url,body,resources[]{label,url}}`;
      const q = encodeURIComponent(groq);
      return `https://${PROJECT_ID}.api.sanity.io/v${API_VERSION}/data/query/${DATASET}?query=${q}`;
    };
    try {
      // Try locale-specific doc first; fallback to English if not found
      const res1 = await fetch(buildUrl(LOCALE));
      const json1 = await res1.json();
      let doc = json1.result;
      if (!doc && LOCALE !== 'en') {
        const res2 = await fetch(buildUrl('en'));
        const json2 = await res2.json();
        doc = json2.result;
      }
      if (!doc) {
        // No article found; only redirect if on dynamic template
        if (isArticleTemplate) {
          window.location.href = 'publications.html';
        }
        return;
      }
      renderArticle(doc);
      // Optionally update document title
      if (doc.title) document.title = `${doc.title} | CzechAlert`;
    } catch (e) {
      console.error('Failed to load article', e);
    }
  }

  // Run after DOM is ready; if already loaded, run immediately
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
