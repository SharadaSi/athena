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

  // Convert Sanity Portable Text blocks to formatted HTML while preserving all styling
  // Handles: headings (h1-h4), paragraphs, bold, italic, underline, strikethrough, links
  function blocksToFormattedHTML(blocks) {
    if (!Array.isArray(blocks)) return [];
    const htmlElements = [];

    for (const block of blocks) {
      if (!block || block._type !== 'block') continue;

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

      // Render children with formatting
      if (!Array.isArray(block.children)) continue;

      const element = document.createElement(tagName);
      element.className = className;

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

        element.appendChild(wrapper);
      }

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
    // Set article main image and alt text for SEO and accessibility
    if (imgEl && doc.imageUrl) {
    imgEl.src = doc.imageUrl;
    if (doc.imageAlt) imgEl.alt = doc.imageAlt;
    }
    // Author, published date, and read time under the heading
    if (authorEl) authorEl.textContent = doc.author || 'CzechAlert';
    if (dateEl) dateEl.textContent = formatDate(doc.publishedAt);
    if (readEl) readEl.textContent = doc.readTime || '5 min read';

    // First paragraph (prefer explicit perex, fallback to first body block)
    const htmlElements = blocksToFormattedHTML(doc.body);
    const first = doc.perex || (htmlElements.length > 0 ? htmlElements[0].textContent : '');
    if (firstParaEl) firstParaEl.textContent = first;

    // Remaining body blocks with preserved formatting
    if (bodyContainer) {
      // Skip the first element if we used it for perex
      const startIndex = doc.perex ? 0 : 1;
      for (let i = startIndex; i < htmlElements.length; i++) {
        bodyContainer.appendChild(htmlElements[i].cloneNode(true));
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
      body,
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
      "translationRef": translationOf._ref,
      body,
      resources[]{label,url},
      meta
    }`;
    const q = encodeURIComponent(groq);
    return `https://${PROJECT_ID}.api.sanity.io/v${API_VERSION}/data/query/${DATASET}?query=${q}`;
  }

  async function fetchDoc(locale, slug) {
    const res = await fetch(buildArticleQuery(locale, slug));
    const json = await res.json();
    return json.result;
  }

  async function fetchAnyDoc(slug) {
    const res = await fetch(buildAnyArticleQuery(slug));
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
      const res = await fetch(url);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const json = await res.json();
      console.log('Translation lookup result:', json.result);
      return json.result ? json.result.slug : null;
    } catch (e) {
      console.warn('Translation lookup failed', e);
      return null;
    }
  }

  // Fetch article by slug via GROQ HTTP API, map to translation if needed, then render
  async function run() {
    const slug = getSlug();
    const path = window.location.pathname || '';
    const isArticleTemplate = /\/(?:cs\/)?article\.html$/i.test(path);
    if (!slug && isArticleTemplate) {
      window.location.href = 'publications.html';
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
          window.location.href = 'publications.html';
        }
        return;
      }

      renderArticle(doc);
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
