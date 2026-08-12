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
  // Locale-aware base path for building canonical/og article URLs.
  const articleBasePath = isCzech ? '/cs/article' : '/article';

  // Read the `slug` query parameter from current URL
  function getSlug() {
    const params = new URLSearchParams(window.location.search);
    return params.get('slug');
  }

  // Format ISO date to "6th December 2025" (ordinal suffixes)
  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';

    // Czech locale: day. month year (e.g., "6. prosince 2025")
    if (LOCALE === 'cs') {
      return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    // English locale: ordinal day + month name (e.g., "6th December 2025")
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

  // Build a <figure> containing a sandboxed iframe for an embedded HTML chart
  // We fetch the chart HTML and inject it via `srcdoc` rather than using `src`.
  // Sanity's file CDN serves uploaded HTML with `Content-Security-Policy: default-src 'self'; script-src 'none'`,
  // which blocks the inline <style> and <script> tags inside our chart files.
  // Documents created via `srcdoc` are not subject to that response-header CSP, while the
  // `sandbox` attribute still isolates the chart from the parent page.
  function chartEmbedToElement(block) {
    if (!block || !block.chartUrl) return null;
    const figure = document.createElement('figure');
    figure.className = 'article-page--chart';

    const iframe = document.createElement('iframe');
    iframe.loading = 'lazy';
    iframe.setAttribute('sandbox', 'allow-scripts');
    const height = Number(block.height) > 0 ? Number(block.height) : 500;
    iframe.style.width = '100%';
    iframe.style.height = height + 'px';
    iframe.style.border = '0';
    const label = (block.description || block.caption || 'Embedded interactive chart').trim();
    iframe.title = label;
    iframe.setAttribute('aria-label', label);
    if (block.allowFullscreen) {
      iframe.setAttribute('allow', 'fullscreen');
      iframe.setAttribute('allowfullscreen', '');
    }
    figure.appendChild(iframe);

    // Fetch the chart HTML and inject via srcdoc (bypasses Sanity CDN's CSP header).
    // Falls back to direct `src` if the fetch fails (e.g., CORS regression).
    // `credentials: 'omit'` prevents Firefox Strict ETP / cross-site tracking heuristics
    // from blocking the request (Sanity's CDN sets Access-Control-Allow-Credentials: true,
    // which can otherwise classify the response as a tracking cookie carrier).
    fetch(block.chartUrl, { credentials: 'omit' })
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error('HTTP ' + res.status))))
      .then((html) => { iframe.srcdoc = html; })
      .catch(() => { iframe.src = block.chartUrl; });

    if (block.caption && block.caption.trim()) {
      const caption = document.createElement('figcaption');
      caption.className = 'article-page--chart-caption';
      caption.textContent = block.caption.trim();
      figure.appendChild(caption);
    }
    return figure;
  }

  // Build a <figure> for an inline image embedded in the article body.
  // Uses Sanity's image CDN query params (`?w=...&auto=format&q=75`) to deliver
  // an appropriately sized, modern-format (WebP/AVIF) image. The original
  // intrinsic dimensions come from `asset->metadata.dimensions` (projected in
  // GROQ) and are set on the <img> to prevent CLS while the image loads.
  //
  // Prefers the shared `window.applySanityImg` helper from `js/sanity-image.js`
  // when available so every Sanity image on the site flows through one
  // responsive-URL builder. Falls back to a hand-rolled srcset if the helper
  // script failed to load — inline images stay legible no matter what.
  function inlineImageToElement(block) {
    if (!block || !block.imageUrl) return null;
    const figure = document.createElement('figure');
    figure.className = 'article-page--inline-image';

    const img = document.createElement('img');
    img.alt = (block.alt || block.caption || '').trim();

    const sizesClause = '(max-width: 800px) 100vw, 800px';

    if (typeof window.applySanityImg === 'function') {
      window.applySanityImg(img, {
        url: block.imageUrl,
        sizes: sizesClause,
        widths: [320, 640, 960, 1280, 1600],
        dimensions: block.dimensions,
        lqip: block.lqip,
      });
    } else {
      img.loading = 'lazy';
      img.decoding = 'async';
      if (block.dimensions && block.dimensions.width && block.dimensions.height) {
        img.width = block.dimensions.width;
        img.height = block.dimensions.height;
      }
      const base = block.imageUrl;
      const sep = base.includes('?') ? '&' : '?';
      const widths = [640, 960, 1280, 1600];
      img.src = `${base}${sep}w=1280&auto=format&q=75`;
      img.srcset = widths
        .map((w) => `${base}${sep}w=${w}&auto=format&q=75 ${w}w`)
        .join(', ');
      img.sizes = sizesClause;
    }

    figure.appendChild(img);

    if (block.caption && block.caption.trim()) {
      const caption = document.createElement('figcaption');
      caption.className = 'article-page--inline-image-caption';
      caption.textContent = block.caption.trim();
      figure.appendChild(caption);
    }
    return figure;
  }

  // Render the inline children (text spans + marks) of a Portable Text block
  // into the provided parent element. Extracted so it can be reused by both
  // regular blocks and list-item blocks.
  function renderInlineChildren(block, parentElement) {
    if (!Array.isArray(block.children)) return;
    for (const child of block.children) {
        if (!child.text) continue;

        // Determine if text has marks (bold, italic, underline, strikethrough, link)
        const marks = Array.isArray(child.marks) ? child.marks : [];
        const hasBold = marks.includes('strong');
        const hasItalic = marks.includes('em');
        const hasUnderline = marks.includes('underline');
        const hasStrikethrough = marks.includes('strike-through');
        
        // Find link mark: check both inline objects and mark definition references
        let linkMark = marks.find((m) => typeof m === 'object' && m._type === 'link');
        
        // If not found as inline link object, look for mark definition by ID
        if (!linkMark) {
          const markDefId = marks.find((m) => typeof m === 'string');
          if (markDefId && block.markDefs) {
            linkMark = block.markDefs.find((def) => def._key === markDefId);
          }
        }

        // Build the text node with appropriate wrappers
        let textNode;

        if (linkMark && linkMark.href) {
          // Link element
          textNode = document.createElement('a');
          textNode.href = linkMark.href;
          textNode.target = '_blank';
          textNode.rel = 'noopener noreferrer';
          textNode.textContent = child.text;
        } else {
          // Regular text span
          textNode = document.createTextNode(child.text);
        }

        // Wrap with formatting tags as needed
        let wrapper = textNode;

        if (hasStrikethrough) {
          const s = document.createElement('s');
          s.appendChild(wrapper);
          wrapper = s;
        }

        if (hasUnderline) {
          const u = document.createElement('u');
          u.appendChild(wrapper);
          wrapper = u;
        }

        // Bold text: wrap as <em><strong>text</strong></em>
        if (hasBold) {
          const strong = document.createElement('strong');
          strong.appendChild(wrapper);
          wrapper = strong;
        }

        // Italic text: wrap as <em><i>text</i></em>
        if (hasItalic) {
          const i = document.createElement('i');
          i.appendChild(wrapper);
          wrapper = i;
        }

        // Apply em wrapper for bold or italic text
        if (hasBold || hasItalic) {
          const em = document.createElement('em');
          em.appendChild(wrapper);
          wrapper = em;
        }

        parentElement.appendChild(wrapper);
      }
  }

  // Convert Sanity Portable Text blocks to formatted HTML while preserving all styling
  // Handles: headings (h1-h4), paragraphs, bold, italic, underline, strikethrough, links,
  // bullet/numbered lists (with nesting via `level`), and custom chartEmbed objects
  // rendered as sandboxed iframes.
  function blocksToFormattedHTML(blocks) {
    if (!Array.isArray(blocks)) return [];
    const htmlElements = [];

    // List grouping state: consecutive Portable Text blocks with a `listItem`
    // property must be merged into a single <ul>/<ol>. We track a stack of
    // currently open list elements indexed by nesting level (1-based).
    let listStack = []; // [{ level, type: 'bullet'|'number', element }]

    const closeListsToLevel = (targetLevel) => {
      while (listStack.length > targetLevel) listStack.pop();
    };
    const resetLists = () => { listStack = []; };
    // Find the list element for the current item's level; open new ones as needed.
    const getListContainer = (level, listType) => {
      // If the level already matches but the type differs, close it so we open the right tag.
      if (listStack[level - 1] && listStack[level - 1].type !== listType) {
        listStack = listStack.slice(0, level - 1);
      }
      // Ensure all ancestor levels exist; missing levels get implicit wrappers.
      for (let i = 0; i < level; i++) {
        if (!listStack[i]) {
          const tag = listType === 'number' ? 'ol' : 'ul';
          const listEl = document.createElement(tag);
          listEl.className = listType === 'number'
            ? 'article-page--ordered-list'
            : 'article-page--bullet-list';
          if (i === 0) {
            // Top-level list — append to the article output.
            htmlElements.push(listEl);
          } else {
            // Nested list — append inside the last <li> of the parent level.
            const parentList = listStack[i - 1].element;
            const lastItem = parentList.lastElementChild;
            (lastItem || parentList).appendChild(listEl);
          }
          listStack[i] = { level: i + 1, type: listType, element: listEl };
        }
      }
      // Trim any deeper open lists (we're going shallower).
      closeListsToLevel(level);
      return listStack[level - 1].element;
    };

    for (const block of blocks) {
      if (!block) continue;

      if (block._type === 'chartEmbed') {
        resetLists();
        const chartEl = chartEmbedToElement(block);
        if (chartEl) htmlElements.push(chartEl);
        continue;
      }

      if (block._type === 'inlineImage') {
        resetLists();
        const imgEl = inlineImageToElement(block);
        if (imgEl) htmlElements.push(imgEl);
        continue;
      }

      if (block._type !== 'block') continue;

      // List item: render as <li> inside the current list container.
      if (block.listItem) {
        const level = Math.max(1, Number(block.level) || 1);
        const listType = block.listItem === 'number' ? 'number' : 'bullet';
        const container = getListContainer(level, listType);
        const li = document.createElement('li');
        li.className = 'article-page--list-item';
        renderInlineChildren(block, li);
        container.appendChild(li);
        continue;
      }

      // Non-list block — close any open lists before emitting it.
      resetLists();

      // Determine block style (heading or paragraph)
      const style = block.style || 'normal';
      let tagName = 'p';
      let className = 'article-page--content-p other-paragraphs';

      if (style === 'h1') {
        tagName = 'h1';
        className = 'article-page--heading-h1';
      } else if (style === 'h2') {
        tagName = 'h2';
        className = 'article-page--heading-h2';
      } else if (style === 'h3') {
        tagName = 'h3';
        className = 'article-page--heading-h3';
      } else if (style === 'h4') {
        tagName = 'h4';
        className = 'article-page--heading-h4';
      }

      const element = document.createElement(tagName);
      element.className = className;
      renderInlineChildren(block, element);
      htmlElements.push(element);
    }

    return htmlElements;
  }

  // Set meta description tag in document head
  function setMetaDescription(description) {
    if (!description) return; //Exit the function if meta description is unavailable
    
    // Check if meta description tag exists
    let metaTag = document.querySelector('meta[name="description"]');
    
    if (metaTag) {
      // If meta tag exists, populate the content atribute
      metaTag.setAttribute('content', description); 
    } else {
      // If there is not meta tag, create one and populate it
      metaTag = document.createElement('meta');
      metaTag.setAttribute('name', 'description');
      metaTag.setAttribute('content', description);
      document.head.appendChild(metaTag); //Insert meta tag into document head
    }
  }

  // --- Per-article canonical + og:url (critical for indexing) ---
  // The static article template hardcodes a canonical of the bare "/article"
  // page. Without rewriting it per slug, Google treats every article as a
  // duplicate of "/article" and drops them from the index. Here we point the
  // canonical (and og:url) at the *specific* article URL so each post is
  // indexed as its own page.
  function setCanonical(slug) {
    if (!slug) return;
    const origin = 'https://czechalert.com';
    // Rebuild the article URL for the current locale + slug.
    const url = `${origin}${articleBasePath}?slug=${encodeURIComponent(slug)}`;

    // Canonical link — create it if the template somehow lacks one.
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', url);

    // Open Graph URL — keep social/share previews pointing at the real post.
    let ogUrl = document.querySelector('meta[property="og:url"]');
    if (!ogUrl) {
      ogUrl = document.createElement('meta');
      ogUrl.setAttribute('property', 'og:url');
      document.head.appendChild(ogUrl);
    }
    ogUrl.setAttribute('content', url);
  }

  // Render a single article document into page elements
  function renderArticle(doc) {
    const titleEl = document.querySelector('.article-page--heading');
    const subtitleContainer = document.querySelector('.article-page--subheading-container');
    const subtitleEl = subtitleContainer ? subtitleContainer.querySelector('.article-page--subheading') : null;
    const imgEl = document.querySelector('.article-page--content-img');
    const firstParaEl = document.querySelector('.first-paragraph');
    const bodyContainer = document.getElementById('article-body');
    const authorEl = document.querySelector('.article-page--features .author');
    const dateEl = document.querySelector('.article-page--features .date');
    const readEl = document.querySelector('.article-page--features .read-time');
    const resourcesContainer = document.getElementById('article-resources');
    const resourcesList = document.getElementById('article-resources-list');

    // Calling the function to set meta description for SEO 
    if (doc.meta) { //meta is standardized end point for meta description in Sanity
      setMetaDescription(doc.meta); //Meta description function called in html document and pass Sanity filled meta into this function
    }

    // Point the canonical/og:url at this specific article so Google indexes it
    // as its own page instead of collapsing it into the bare "/article" URL.
    setCanonical(doc.slug || getSlug());

    // Title, subtitle and main image
    if (titleEl) titleEl.textContent = doc.title || '';
    if (subtitleEl) {
      const hasSubheading = Boolean(doc.previewHeading && doc.previewHeading.trim());
      if (hasSubheading) {
        subtitleEl.textContent = doc.previewHeading.trim();
        subtitleEl.style.display = '';
      } else {
        subtitleEl.textContent = '';
        subtitleEl.style.display = 'none';
      }
    }
    // Set article main image and alt text for SEO and accessibility.
    // The hero is above the fold — mark it `eager` and let the helper pick
    // the responsive bundle. Falls back to a single `src` if the helper
    // script (`js/sanity-image.js`) didn't load.
    if (imgEl && doc.imageUrl) {
      if (doc.imageAlt) imgEl.alt = doc.imageAlt;
      imgEl.dataset.eager = 'true';
      if (typeof window.applySanityImg === 'function') {
        window.applySanityImg(imgEl, {
          url: doc.imageUrl,
          sizes: '(min-width: 64rem) 70vw, 100vw',
          dimensions: doc.imageDims,
          lqip: doc.imageLqip,
        });
      } else {
        imgEl.src = doc.imageUrl;
      }
    }
    // Author, published date, and read time under the heading
    if (authorEl) authorEl.textContent = doc.author || 'CzechAlert';
    if (dateEl) dateEl.textContent = formatDate(doc.publishedAt);
    if (readEl) readEl.textContent = doc.readTime || '5 min read';

    // First paragraph (prefer explicit perex, fallback to first paragraph block)
    const htmlElements = blocksToFormattedHTML(doc.body);
    // Find the first <p> element to use as fallback perex (skip charts/figures/headings)
    let perexFallbackIndex = -1;
    if (!doc.perex) {
      for (let i = 0; i < htmlElements.length; i++) {
        if (htmlElements[i].tagName === 'P') { perexFallbackIndex = i; break; }
      }
    }
    const first = doc.perex || (perexFallbackIndex >= 0 ? htmlElements[perexFallbackIndex].textContent : '');
    if (firstParaEl) firstParaEl.textContent = first;

    // Append remaining body elements, skipping the one consumed as perex fallback.
    // We append the original elements (not clones) because chartEmbed iframes hold
    // an async fetch closure that updates `iframe.srcdoc` once the chart HTML loads —
    // cloning would detach the live element from that closure and leave the iframe blank.
    if (bodyContainer) {
      for (let i = 0; i < htmlElements.length; i++) {
        if (i === perexFallbackIndex) continue;
        bodyContainer.appendChild(htmlElements[i]);
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
        let label = (r.label || r.url || '').trim();
        // Always capitalize first letter
        if (label && label.length > 0) {
          label = label.charAt(0).toUpperCase() + label.slice(1);
        }
        a.href = r.url || '#';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.className = 'article-page--resource-link';
        
        // Create number span
        const numSpan = document.createElement('span');
        numSpan.className = 'article-page--resource-number';
        numSpan.textContent = `${i + 1}. `;
        
        // Create label span
        const labelSpan = document.createElement('span');
        labelSpan.className = 'article-page--resource-label';
        labelSpan.textContent = label;
        
        a.appendChild(numSpan);
        a.appendChild(labelSpan);
        li.className = "article-page--resource-item";
        li.appendChild(a);
        resourcesList.appendChild(li);
      });
    }
  }

  function buildArticleQuery(locale, slug) {
    const groq = `*[_type=="post" && language == "${locale}" && slug.current=="${slug}"][0]{
      _id,
      language,
      title,
      previewHeading,
      perex,
      readTime,
      "slug": slug.current,
      author,
      publishedAt,
      "imageUrl": image.asset->url,
      "imageAlt": image.alt,
      "imageDims": image.asset->metadata.dimensions,
      "imageLqip": image.asset->metadata.lqip,
      body[]{
        ...,
        _type == "chartEmbed" => { ..., "chartUrl": file.asset->url },
        _type == "inlineImage" => {
          ...,
          "imageUrl": asset->url,
          "dimensions": asset->metadata.dimensions{width, height},
          "lqip": asset->metadata.lqip
        }
      },
      "translationRef": translationOf._ref,
      resources[]{label,url},
      meta
    }`;
    const q = encodeURIComponent(groq); //q as querry
    return `https://${PROJECT_ID}.api.sanity.io/v${API_VERSION}/data/query/${DATASET}?query=${q}`; //Output this query out of this function
  }

  function buildAnyArticleQuery(slug) {
    // Find any post by slug regardless of language
    // Used when switching languages: find current post, then look up its translation via translationRef
    const groq = `*[_type=="post" && slug.current=="${slug}"][0]{
      _id,
      language,
      title,
      previewHeading,
      perex,
      readTime,
      "slug": slug.current,
      author,
      publishedAt,
      "imageUrl": image.asset->url,
      "imageAlt": image.alt,
      "imageDims": image.asset->metadata.dimensions,
      "imageLqip": image.asset->metadata.lqip,
      "translationRef": translationOf._ref,
      body[]{
        ...,
        _type == "chartEmbed" => { ..., "chartUrl": file.asset->url },
        _type == "inlineImage" => {
          ...,
          "imageUrl": asset->url,
          "dimensions": asset->metadata.dimensions{width, height},
          "lqip": asset->metadata.lqip
        }
      },
      resources[]{label,url},
      meta
    }`;
    const q = encodeURIComponent(groq);
    return `https://${PROJECT_ID}.api.sanity.io/v${API_VERSION}/data/query/${DATASET}?query=${q}`;
  }

  // `credentials: 'omit'` keeps these as plain anonymous CORS requests so Firefox Private
  // Browsing (Strict ETP) and content blockers don't classify them as tracking traffic.
  async function fetchDoc(locale, slug) {
    const res = await fetch(buildArticleQuery(locale, slug), { credentials: 'omit' });
    const json = await res.json();
    return json.result;
  }

  async function fetchAnyDoc(slug) {
    const res = await fetch(buildAnyArticleQuery(slug), { credentials: 'omit' });
    const json = await res.json();
    return json.result;
  }

  // Find a translation slug using the manual translationOf reference field
  // Also searches bidirectionally in case the reference is not reciprocal
  async function findTranslationSlugFromDoc(doc, targetLocale) {
    if (!doc) {
      console.log('No document provided');
      return null;
    }

    console.log('Looking for translation. Doc ID:', doc._id, 'Doc language:', doc.language, 'Target locale:', targetLocale);

    let groq;
    
    if (doc.translationRef) {
      console.log('Using translationRef:', doc.translationRef);
      // Query the directly referenced translation document
      groq = `*[_type=="post" && _id=="${doc.translationRef}" && language == "${targetLocale}"][0]{"slug":slug.current}`;
    } else {
      console.log('No translationRef found. Searching bidirectionally by title...');
      // Fallback: search by title (assumes translations have the same title)
      // This is more robust if references aren't set up
      groq = `*[_type=="post" && language == "${targetLocale}" && title == "${doc.title}"][0]{"slug":slug.current}`;
    }

    const q = encodeURIComponent(groq);
    const url = `https://${PROJECT_ID}.api.sanity.io/v${API_VERSION}/data/query/${DATASET}?query=${q}`;
    
    try {
      const res = await fetch(url, { credentials: 'omit' });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const json = await res.json();
      console.log('Translation lookup result:', json.result);
      return json.result ? json.result.slug : null;
    } catch (e) {
      console.warn('Translation lookup failed', e);
      return null;
    }
  }

  // Toggle the skeleton loader state on the article section.
  // The `.is-loading` class is set in the HTML so placeholders appear before
  // JS executes; we strip it once the real content has been rendered (or on
  // a hard failure, so the user isn't left staring at a shimmer forever).
  function setLoading(isLoading) {
    const section = document.querySelector('.article-page');
    if (!section) return;
    if (isLoading) {
      section.classList.add('is-loading');
      section.setAttribute('aria-busy', 'true');
    } else {
      section.classList.remove('is-loading');
      section.removeAttribute('aria-busy');
    }
  }

  // Fetch article by slug via GROQ HTTP API, map to translation if needed, then render
  async function run() {
    const slug = getSlug();
    const path = window.location.pathname || '';
    const isArticleTemplate = /\/(?:cs\/)?article(?:\.html)?$/i.test(path);
    if (!slug && isArticleTemplate) {
      window.location.href = 'publications';
      return;
    }

    try {
      // First: find any doc with this slug, regardless of locale
      let doc = await fetchAnyDoc(slug);

      // If we found a doc in a different locale, map to the requested locale via translation reference
      const docLocale = doc ? (doc.language || null) : null;
      if (doc && docLocale !== LOCALE) {
        const translatedSlug = await findTranslationSlugFromDoc(doc, LOCALE);
        if (translatedSlug && translatedSlug !== slug) {
          const url = new URL(window.location.href);
          url.searchParams.set('slug', translatedSlug);
          window.location.assign(url.toString());
          return;
        }
      }

      // If no doc was found at all, try fetching directly in requested locale (in case slug duplicates exist per locale)
      if (!doc) {
        doc = await fetchDoc(LOCALE, slug);
      }

      if (!doc) {
        if (isArticleTemplate) {
          window.location.href = 'publications';
        }
        return;
      }

      renderArticle(doc);
      if (doc.title) document.title = `${doc.title} | CzechAlert`;
      // Article is fully populated — drop the skeleton placeholders.
      setLoading(false);
    } catch (e) {
      console.error('Failed to load article', e);
      // Even on failure, remove the skeleton so the (empty) page is at least
      // legible rather than perpetually shimmering.
      setLoading(false);
    }
  }

  // Run after DOM is ready; if already loaded, run immediately
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
