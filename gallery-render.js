let catalogData = [];
let activeCategory = 'all';

document.addEventListener('DOMContentLoaded', async () => {
  await loadCatalog();
  setupFilterButtons();
  
  // Attach sort listener if select exists
  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', applyFiltersAndSort);
  }
});

async function loadCatalog() {
  try {
    // Append current timestamp to force browsers to fetch fresh JSON every time
    const response = await fetch(`data/paintings.json?v=${Date.now()}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    catalogData = await response.json();
    applyFiltersAndSort();
  } catch (err) {
    console.error("Could not load catalog:", err);
    const grid = document.getElementById('art-grid');
    if (grid) {
      grid.innerHTML = `<p class="no-results">Error loading catalog. Please try refreshing.</p>`;
    }
  }
}

function setupFilterButtons() {
  const buttons = document.querySelectorAll('.filter-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      buttons.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      activeCategory = e.target.getAttribute('data-category') || 'all';
      applyFiltersAndSort();
    });
  });
}

function applyFiltersAndSort() {
  let items = [...catalogData];

  // 1. Category Filter
  if (activeCategory !== 'all') {
    items = items.filter(item => {
      return item.category && item.category.toLowerCase() === activeCategory.toLowerCase();
    });
  }

  // 2. Sorting
  const sortSelect = document.getElementById('sort-select');
  const sortValue = sortSelect ? sortSelect.value : 'newest';

  items.sort((a, b) => {
    if (sortValue === 'price-low') {
      return (a.price || 0) - (b.price || 0);
    } else if (sortValue === 'price-high') {
      return (b.price || 0) - (a.price || 0);
    } else {
      // Default: Newest first (by ID timestamp or dateAdded)
      const dateA = a.id || new Date(a.dateAdded || 0).getTime();
      const dateB = b.id || new Date(b.dateAdded || 0).getTime();
      return dateB - dateA;
    }
  });

  renderGrid(items);
}

function renderGrid(items) {
  const grid = document.getElementById('art-grid');
  if (!grid) return;
  
  grid.innerHTML = '';

  if (items.length === 0) {
    grid.innerHTML = `<p class="no-results">No artwork currently listed in this category.</p>`;
    return;
  }

  items.forEach((item, index) => {
    const card = document.createElement('article');
    card.className = 'art-card';

    // Safely handle both multi-photo arrays (images: []) and legacy single strings (image: "")
    let imageList = [];
    if (Array.isArray(item.images) && item.images.length > 0) {
      imageList = item.images;
    } else if (item.image) {
      imageList = [item.image];
    } else {
      imageList = ['assets/images/placeholder.jpg'];
    }

    const mainImg = imageList[0];
    const hasMultiple = imageList.length > 1;

    // Mailto link for direct inquiries
    const emailSubject = encodeURIComponent(`Inquiry: ${item.title}`);
    const emailBody = encodeURIComponent(
      `Hello Mike,\n\nI am interested in acquiring "${item.title}" (${item.dimensions || ''}, ${item.priceDisplay || ''}). Please let me know if it is still available.\n\nThank you!`
    );
    const mailLink = `mailto:your-email@example.com?subject=${emailSubject}&body=${emailBody}`;

    // Generate hidden lightbox links for secondary photos (Back / Detail views)
    let extraLightboxLinks = '';
    for (let i = 1; i < imageList.length; i++) {
      extraLightboxLinks += `
        <a href="${imageList[i]}" 
           class="glightbox" 
           data-gallery="gallery-${index}" 
           data-title="${escapeHtml(item.title)} (View ${i + 1})" 
           data-description="${escapeHtml(item.materials || '')} • ${escapeHtml(item.dimensions || '')}" 
           style="display:none;"></a>
      `;
    }

    card.innerHTML = `
      <div class="image-wrapper">
        <a href="${mainImg}" 
           class="glightbox" 
           data-gallery="gallery-${index}" 
           data-title="${escapeHtml(item.title)}" 
           data-description="${escapeHtml(item.materials || '')} • ${escapeHtml(item.dimensions || '')}">
          <img src="${mainImg}" alt="${escapeHtml(item.title)}" loading="lazy">
        </a>
        ${hasMultiple ? `<span class="photo-badge">${imageList.length} Photos</span>` : ''}
        ${extraLightboxLinks}
      </div>
      <div class="card-details">
        <div class="card-header">
          <h2 class="item-title">${escapeHtml(item.title)}</h2>
          <span class="item-price">${escapeHtml(item.priceDisplay || '')}</span>
        </div>
        <p class="item-meta">${escapeHtml(item.category || '')} ${item.dimensions ? '• ' + escapeHtml(item.dimensions) : ''}</p>
        <p class="item-materials">${escapeHtml(item.materials || '')}</p>
        <div class="card-action">
          <a href="${mailLink}" class="btn-inquire">Inquire / Acquire</a>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });

  // Re-initialize GLightbox for new DOM elements if available
  if (typeof GLightbox !== 'undefined') {
    GLightbox({ selector: '.glightbox' });
  }
}

// Utility helper to prevent HTML injection in titles/descriptions
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
