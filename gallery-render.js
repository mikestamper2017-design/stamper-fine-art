let catalogData = [];
let activeCategory = 'all';
let filteredItems = [];
let lightboxInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadCatalog();
  setupFilterButtons();
  
  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', applyFiltersAndSort);
  }
});

async function loadCatalog() {
  try {
    const response = await fetch(`data/paintings.json?v=${Date.now()}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    catalogData = await response.json();
    applyFiltersAndSort();
  } catch (err) {
    console.error("Could not load catalog:", err);
    const stage = document.getElementById('featured-stage');
    if (stage) {
      stage.innerHTML = `<p class="no-results">Error loading catalog. Please try refreshing.</p>`;
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
    } else if (sortValue === 'size-small') {
      return (parseInt(a.dimensions) || 0) - (parseInt(b.dimensions) || 0);
    } else if (sortValue === 'size-large') {
      return (parseInt(b.dimensions) || 0) - (parseInt(a.dimensions) || 0);
    } else {
      const dateA = a.id || new Date(a.dateAdded || 0).getTime();
      const dateB = b.id || new Date(b.dateAdded || 0).getTime();
      return dateB - dateA;
    }
  });

  filteredItems = items;
  renderReelAndStage(filteredItems);
}

function renderReelAndStage(items) {
  const reel = document.getElementById('art-strip-reel');
  if (!reel) return;

  reel.innerHTML = '';

  if (items.length === 0) {
    reel.innerHTML = `<p class="no-results">No artwork found in this category.</p>`;
    clearStage();
    return;
  }

  // 1. Create exactly ONE thumbnail per artwork item in the reel
  items.forEach((item, index) => {
    const mainImg = getPrimaryImage(item);
    
    const thumbBtn = document.createElement('button');
    thumbBtn.className = `reel-thumb ${index === 0 ? 'active' : ''}`;
    thumbBtn.setAttribute('aria-label', `View ${item.title}`);
    thumbBtn.innerHTML = `<img src="${mainImg}" alt="${escapeHtml(item.title)}" loading="lazy">`;

    thumbBtn.addEventListener('click', () => {
      document.querySelectorAll('.reel-thumb').forEach(t => t.classList.remove('active'));
      thumbBtn.classList.add('active');
      
      displayArtworkOnStage(item);
    });

    reel.appendChild(thumbBtn);
  });

  // 2. Load the first artwork onto the Hero Stage
  displayArtworkOnStage(items[0]);
}

function displayArtworkOnStage(item) {
  const stageImg = document.getElementById('main-art-img');
  const stageLightbox = document.getElementById('stage-lightbox-link');
  const stageTitle = document.getElementById('main-art-title');
  const stagePrice = document.getElementById('main-art-price');
  const stageMeta = document.getElementById('main-art-meta');
  const stageMaterials = document.getElementById('main-art-materials');
  const stageInquire = document.getElementById('main-art-inquire');

  const imageList = Array.isArray(item.images) && item.images.length > 0 
    ? item.images 
    : (item.image ? [item.image] : ['assets/images/placeholder.jpg']);

  const mainImg = imageList[0];

  // Direct Mailto Link
  const emailSubject = encodeURIComponent(`Inquiry: ${item.title}`);
  const emailBody = encodeURIComponent(
    `Hello Mike,\n\nI am interested in acquiring "${item.title}" (${item.dimensions || ''}, ${item.priceDisplay || ''}). Please let me know if it is still available.\n\nThank you!`
  );
  const mailLink = `mailto:mike_stamper@hotmail.com?subject=${emailSubject}&body=${emailBody}`;

  // Update DOM Details
  if (stageImg) {
    stageImg.src = mainImg;
    stageImg.alt = escapeHtml(item.title);
  }
  if (stageLightbox) {
    stageLightbox.href = mainImg;
    stageLightbox.setAttribute('data-title', escapeHtml(item.title));
    stageLightbox.setAttribute('data-description', `${escapeHtml(item.materials || '')} • ${escapeHtml(item.dimensions || '')}`);
  }
  if (stageTitle) stageTitle.textContent = item.title;
  if (stagePrice) stagePrice.textContent = item.priceDisplay || '';
  if (stageMeta) stageMeta.textContent = `${item.category || ''} ${item.dimensions ? '• ' + item.dimensions : ''}`;
  if (stageMaterials) stageMaterials.textContent = item.materials || '';
  if (stageInquire) stageInquire.href = mailLink;

  // Build secondary photo hidden links inside image wrapper for GLightbox gallery navigation
  const imageWrapper = document.querySelector('.image-wrapper');
  if (imageWrapper) {
    const existingSecondaryGroup = document.getElementById('secondary-lightbox-links');
    if (existingSecondaryGroup) existingSecondaryGroup.remove();

    const secondaryGroup = document.createElement('div');
    secondaryGroup.id = 'secondary-lightbox-links';

    // Append secondary image links for multi-photo works
    for (let i = 1; i < imageList.length; i++) {
      const extraLink = document.createElement('a');
      extraLink.href = imageList[i];
      extraLink.className = 'glightbox';
      extraLink.setAttribute('data-gallery', 'hero-gallery');
      extraLink.setAttribute('data-title', `${escapeHtml(item.title)} (View ${i + 1}/${imageList.length})`);
      extraLink.setAttribute('data-description', `${escapeHtml(item.materials || '')} • ${escapeHtml(item.dimensions || '')}`);
      extraLink.style.display = 'none';
      secondaryGroup.appendChild(extraLink);
    }
    imageWrapper.appendChild(secondaryGroup);

    // Update photo count badge
    const oldBadge = imageWrapper.querySelector('.photo-count');
    if (oldBadge) oldBadge.remove();

    if (imageList.length > 1) {
      const badge = document.createElement('span');
      badge.className = 'photo-count';
      badge.textContent = `Tap Image to View All ${imageList.length} Photos`;
      imageWrapper.appendChild(badge);
    }
  }

  // Ensure primary anchor is tagged for hero gallery grouping
  if (stageLightbox) {
    stageLightbox.setAttribute('data-gallery', 'hero-gallery');
  }

  // Re-initialize GLightbox instance cleanly
  if (typeof GLightbox !== 'undefined') {
    if (lightboxInstance) lightboxInstance.destroy();
    lightboxInstance = GLightbox({ selector: '.glightbox' });
  }
}

function clearStage() {
  document.getElementById('main-art-title').textContent = 'No Artwork Available';
  document.getElementById('main-art-price').textContent = '';
  document.getElementById('main-art-meta').textContent = '';
  document.getElementById('main-art-materials').textContent = '';
  document.getElementById('main-art-img').src = '';
  const oldBadge = document.querySelector('.image-wrapper .photo-count');
  if (oldBadge) oldBadge.remove();
}

function getPrimaryImage(item) {
  if (Array.isArray(item.images) && item.images.length > 0) {
    return item.images[0];
  } else if (item.image) {
    return item.image;
  }
  return 'assets/images/placeholder.jpg';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
