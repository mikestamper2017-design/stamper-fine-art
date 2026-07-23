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

  if (activeCategory !== 'all') {
    items = items.filter(item => item.category.toLowerCase() === activeCategory.toLowerCase());
  }

  const sortValue = document.getElementById('sort-select').value;
  items.sort((a, b) => {
    if (sortValue === 'newest') return (b.id || 0) - (a.id || 0);
    if (sortValue === 'price-low') return (a.price || 0) - (b.price || 0);
    if (sortValue === 'price-high') return (b.price || 0) - (a.price || 0);
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

  items.forEach((item, index) => {
    const card = document.createElement('article');
    card.className = 'art-card';

    // Backwards compatibility: handle single "image" vs array "images"
    const imageList = item.images && item.images.length > 0 ? item.images : [item.image];
    const mainImg = imageList[0];
    const hasMultiple = imageList.length > 1;

    const emailSubject = encodeURIComponent(`Inquiry: ${item.title}`);
    const emailBody = encodeURIComponent(`Hello Mike,\n\nI am interested in acquiring "${item.title}" (${item.dimensions}, ${item.priceDisplay}). Please let me know if it is still available.\n\nThank you!`);
    const mailLink = `mailto:mike_stamper@hotmail.com;

    // Generate lightbox hidden links for extra photos
    let extraLightboxLinks = '';
    for (let i = 1; i < imageList.length; i++) {
      extraLightboxLinks += `<a href="${imageList[i]}" class="glightbox" data-gallery="gallery-${index}" data-title="${item.title} (View ${i + 1})" data-description="${item.materials} • ${item.dimensions}" style="display:none;"></a>`;
    }

    card.innerHTML = `
      <div class="image-wrapper">
        <a href="${mainImg}" class="glightbox" data-gallery="gallery-${index}" data-title="${item.title}" data-description="${item.materials} • ${item.dimensions}">
          <img src="${mainImg}" alt="${item.title}" loading="lazy">
        </a>
        ${hasMultiple ? `<span class="photo-badge">${imageList.length} Photos (Double-Sided/Views)</span>` : ''}
        ${extraLightboxLinks}
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

  GLightbox({ selector: '.glightbox' });
}
