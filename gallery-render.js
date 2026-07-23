let catalogData = [];
let activeCategory = 'all';

document.addEventListener('DOMContentLoaded', async () => {
  await loadCatalog();
  setupFilterButtons();
});

async function loadCatalog() {
  try {
    const response = await fetch('data/paintings.json');
    catalogData = await response.json();
    applyFiltersAndSort();
  } catch (err) {
    console.error("Could not load catalog:", err);
  }
}

function setupFilterButtons() {
  const buttons = document.querySelectorAll('.filter-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      buttons.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      activeCategory = e.target.getAttribute('data-category');
      applyFiltersAndSort();
    });
  });
}

function applyFiltersAndSort() {
  let items = [...catalogData];

  // 1. Filter by Category
  if (activeCategory !== 'all') {
    items = items.filter(item => item.category.toLowerCase() === activeCategory.toLowerCase());
  }

  // 2. Sort Items
  const sortValue = document.getElementById('sort-select').value;
  items.sort((a, b) => {
    if (sortValue === 'newest') return (b.id || 0) - (a.id || 0);
    if (sortValue === 'price-low') return (a.price || 0) - (b.price || 0);
    if (sortValue === 'price-high') return (b.price || 0) - (a.price || 0);
    
    // Sort by surface area (Height x Width)
    const areaA = (a.heightInches || 0) * (a.widthInches || 0);
    const areaB = (b.heightInches || 0) * (b.widthInches || 0);
    if (sortValue === 'size-small') return areaA - areaB;
    if (sortValue === 'size-large') return areaB - areaA;
  });

  renderGrid(items);
}

function renderGrid(items) {
  const grid = document.getElementById('art-grid');
  grid.innerHTML = '';

  if (items.length === 0) {
    grid.innerHTML = `<p class="no-results">No artwork currently listed in this category.</p>`;
    return;
  }

  items.forEach(item => {
    const card = document.createElement('article');
    card.className = 'art-card';

    // Build mailto link for specific inquiry
    const emailSubject = encodeURIComponent(`Inquiry: ${item.title}`);
    const emailBody = encodeURIComponent(`Hello Mike,\n\nI am interested in acquiring "${item.title}" (${item.dimensions}, ${item.priceDisplay}). Please let me know if it is still available.\n\nThank you!`);
    const mailLink = `mailto:your-email@example.com?subject=${emailSubject}&body=${emailBody}`;

    card.innerHTML = `
      <div class="image-wrapper">
        <a href="${item.image}" class="glightbox" data-gallery="art-gallery" data-title="${item.title}" data-description="${item.materials} • ${item.dimensions}">
          <img src="${item.image}" alt="${item.title}" loading="lazy">
        </a>
      </div>
      <div class="card-details">
        <div class="card-header">
          <h2 class="item-title">${item.title}</h2>
          <span class="item-price">${item.priceDisplay || ''}</span>
        </div>
        <p class="item-meta">${item.category} • ${item.dimensions}</p>
        <p class="item-materials">${item.materials}</p>
        <div class="card-action">
          <a href="${mailLink}" class="btn-inquire">Inquire / Acquire</a>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });

  // Re-initialize lightbox popups for zoomed viewing
  GLightbox({ selector: '.glightbox' });
}
