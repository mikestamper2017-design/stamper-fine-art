const REPO_OWNER = "mikestamper2017-design";
const REPO_NAME = "stamper-fine-art";

let photosState = [];
let localCatalog = [];
let catalogSha = null;

function saveToken() {
  const token = document.getElementById('gh-token').value.trim();
  if (token) {
    localStorage.setItem('gh_pat', token);
    alert('Token saved to browser storage!');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const savedToken = localStorage.getItem('gh_pat');
  if (savedToken && document.getElementById('gh-token')) {
    document.getElementById('gh-token').value = savedToken;
  }
  addPhotoSlot();
});

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

  if (tabName === 'upload') {
    document.querySelectorAll('.tab-btn')[0].classList.add('active');
    document.getElementById('tab-upload').classList.add('active');
  } else {
    document.querySelectorAll('.tab-btn')[1].classList.add('active');
    document.getElementById('tab-manage').classList.add('active');
    fetchAndRenderCatalogList();
  }
}

// --- PHOTO UPLOAD & CROP LOGIC --- //

function addPhotoSlot() {
  const index = photosState.length;
  photosState.push({ file: null, cropper: null, b64Data: null, origSize: 0 });

  const container = document.getElementById('photos-list');
  const slotDiv = document.createElement('div');
  slotDiv.className = 'photo-card';
  slotDiv.id = `photo-slot-${index}`;

  const labelText = index === 0 ? "Main Photo (Front)" : `Additional Photo #${index + 1} (Back / Detail)`;

  slotDiv.innerHTML = `
    <label style="font-size:15px; font-weight:bold;">${labelText}</label>
    <input type="file" accept="image/*" capture="environment" onchange="handleFileSelect(event, ${index})">
    <div id="preview-wrapper-${index}" style="display:none;">
      <div class="crop-wrapper">
        <img id="img-crop-${index}" src="" alt="Crop Area">
      </div>
      <div class="button-group">
        <button type="button" class="btn-rotate" onclick="rotatePhoto(${index})">Rotate 90°</button>
        <button type="button" class="btn-crop" onclick="applyCrop(${index})">Apply Crop & Save</button>
      </div>
      <div id="stats-${index}" style="font-size:14px; font-weight:600; color:#2e7d32; margin-top:8px;"></div>
    </div>
  `;
  container.appendChild(slotDiv);
}

function handleFileSelect(event, index) {
  const file = event.target.files[0];
  if (!file) return;

  photosState[index].file = file;
  photosState[index].origSize = file.size;
  photosState[index].b64Data = null;

  const reader = new FileReader();
  reader.onload = (e) => {
    const previewWrapper = document.getElementById(`preview-wrapper-${index}`);
    const cropImg = document.getElementById(`img-crop-${index}`);
    
    if (photosState[index].cropper) {
      photosState[index].cropper.destroy();
    }

    cropImg.src = e.target.result;
    previewWrapper.style.display = 'block';

    photosState[index].cropper = new Cropper(cropImg, {
      viewMode: 1,
      autoCropArea: 0.95,
      responsive: true,
      zoomable: true,
      rotatable: true
    });

    document.getElementById(`stats-${index}`).innerText = "Pinch/drag to adjust crop, then tap 'Apply Crop & Save'.";
  };
  reader.readAsDataURL(file);
}

function rotatePhoto(index) {
  if (photosState[index].cropper) {
    photosState[index].cropper.rotate(90);
  }
}

function applyCrop(index) {
  const item = photosState[index];
  if (!item.cropper) return;

  const canvas = item.cropper.getCroppedCanvas({
    maxWidth: 1600,
    maxHeight: 1600,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high'
  });

  canvas.toBlob((blob) => {
    const origMB = (item.origSize / (1024 * 1024)).toFixed(2);
    const newKB = (blob.size / 1024).toFixed(1);

    document.getElementById(`stats-${index}`).innerText = 
      `✓ Cropped & Compressed: ${newKB} KB (Reduced from ${origMB} MB)`;

    const b64Reader = new FileReader();
    b64Reader.onloadend = () => {
      item.b64Data = b64Reader.result.split(',')[1];
    };
    b64Reader.readAsDataURL(blob);
  }, 'image/jpeg', 0.82);
}

async function handleUpload(event) {
  event.preventDefault();
  const token = localStorage.getItem('gh_pat');
  if (!token) return alert("Please save your GitHub Access Token first.");

  const uncropped = photosState.filter(p => p.file !== null && p.b64Data === null);
  if (uncropped.length > 0) return alert("Please tap 'Apply Crop & Save' for each photo.");

  const activePhotos = photosState.filter(p => p.b64Data !== null);
  if (activePhotos.length === 0) return alert("Please select or capture at least one photo.");

  const statusEl = document.getElementById('status-message');
  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;
  statusEl.style.color = "#007aff";
  statusEl.innerText = `Publishing artwork (${activePhotos.length} cropped photos)...`;

  try {
    const title = document.getElementById('art-title').value.trim();
    const cleanSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const timestamp = Date.now();
    const uploadedImagePaths = [];

    for (let i = 0; i < activePhotos.length; i++) {
      const suffix = i === 0 ? 'front' : `view-${i + 1}`;
      const filename = `${cleanSlug}-${suffix}-${timestamp}.jpg`;
      const imagePath = `assets/images/${filename}`;

      statusEl.innerText = `Uploading photo ${i + 1} of ${activePhotos.length}...`;
      await uploadFileToGitHub(imagePath, activePhotos[i].b64Data, `Add image ${i + 1}: ${title}`, token);
      uploadedImagePaths.push(imagePath);
    }

    statusEl.innerText = "Updating catalog database...";
    const jsonPath = `data/paintings.json`;
    const jsonFileData = await getFileFromGitHub(jsonPath, token);
    const paintingsList = JSON.parse(atob(jsonFileData.content));

    const priceStr = document.getElementById('art-price').value.trim();
    const numericPrice = parseFloat(priceStr.replace(/[^0-9.]/g, '')) || 0;

    const newEntry = {
      id: timestamp,
      title: title,
      category: document.getElementById('art-category').value,
      dimensions: document.getElementById('art-size').value,
      materials: document.getElementById('art-materials').value,
      price: numericPrice,
      priceDisplay: priceStr,
      images: uploadedImagePaths,
      dateAdded: new Date().toISOString()
    };

    paintingsList.unshift(newEntry);

    const updatedJsonB64 = btoa(unescape(encodeURIComponent(JSON.stringify(paintingsList, null, 2))));
    await uploadFileToGitHub(jsonPath, updatedJsonB64, `Add metadata: ${title}`, token, jsonFileData.sha);

    statusEl.style.color = "#2e7d32";
    statusEl.innerText = "Success! Published to catalog.";

    photosState.forEach(p => { if (p.cropper) p.cropper.destroy(); });
    document.getElementById('artwork-form').reset();
    document.getElementById('photos-list').innerHTML = '';
    photosState = [];
    addPhotoSlot();
  } catch (err) {
    console.error(err);
    statusEl.style.color = "#d32f2f";
    statusEl.innerText = "Upload failed: " + err.message;
  } finally {
    submitBtn.disabled = false;
  }
}

// --- TAB 2: CATALOG MANAGEMENT (EDIT & DELETE) --- //

async function fetchAndRenderCatalogList() {
  const token = localStorage.getItem('gh_pat');
  const container = document.getElementById('manage-catalog-list');
  const statusEl = document.getElementById('manage-status-message');

  if (!token) {
    container.innerHTML = `<p style="color:#d32f2f; text-align:center;">Please save your GitHub Access Token above.</p>`;
    return;
  }

  container.innerHTML = `<p style="text-align:center; color:#666;">Loading catalog from GitHub...</p>`;
  statusEl.innerText = "";

  try {
    const jsonFileData = await getFileFromGitHub('data/paintings.json', token);
    catalogSha = jsonFileData.sha;
    localCatalog = JSON.parse(decodeURIComponent(escape(atob(jsonFileData.content))));

    if (!localCatalog || localCatalog.length === 0) {
      container.innerHTML = `<p style="text-align:center;">Catalog is currently empty.</p>`;
      return;
    }

    container.innerHTML = '';
    localCatalog.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'edit-item-card';

      const mainImg = (item.images && item.images.length > 0) ? item.images[0] : (item.image || '');

      card.innerHTML = `
        <div class="edit-item-header">
          <strong>#${index + 1}: ${escapeHtml(item.title)}</strong>
          <button type="button" class="btn-danger" onclick="deleteItem(${index})">Delete</button>
        </div>
        ${mainImg ? `<img src="${mainImg}" style="width:100%; max-height:120px; object-fit:cover; border-radius:6px; margin-bottom:8px;">` : ''}
        
        <div class="form-group" style="margin-bottom:8px;">
          <label style="font-size:13px;">Title:</label>
          <input type="text" id="edit-title-${index}" value="${escapeHtml(item.title || '')}">
        </div>

        <div style="display:flex; gap:8px;">
          <div class="form-group" style="flex:1; margin-bottom:8px;">
            <label style="font-size:13px;">Category:</label>
            <select id="edit-cat-${index}">
              <option value="Watercolour" ${item.category === 'Watercolour' ? 'selected' : ''}>Watercolour</option>
              <option value="Paintings" ${item.category === 'Paintings' ? 'selected' : ''}>Paintings</option>
              <option value="Sculpture" ${item.category === 'Sculpture' ? 'selected' : ''}>Sculpture</option>
            </select>
          </div>
          <div class="form-group" style="flex:1; margin-bottom:8px;">
            <label style="font-size:13px;">Price / Status:</label>
            <input type="text" id="edit-price-${index}" value="${escapeHtml(item.priceDisplay || '')}">
          </div>
        </div>

        <div class="form-group" style="margin-bottom:8px;">
          <label style="font-size:13px;">Dimensions:</label>
          <input type="text" id="edit-size-${index}" value="${escapeHtml(item.dimensions || '')}">
        </div>

        <div class="form-group" style="margin-bottom:8px;">
          <label style="font-size:13px;">Materials / Paper:</label>
          <input type="text" id="edit-mat-${index}" value="${escapeHtml(item.materials || '')}">
        </div>

        <button type="button" class="btn-edit-save" onclick="saveItemEdits(${index})">Save Changes to This Item</button>
      `;
      container.appendChild(card);
    });

  } catch (err) {
    console.error(err);
    container.innerHTML = `<p style="color:#d32f2f; text-align:center;">Error loading catalog: ${err.message}</p>`;
  }
}

async function saveItemEdits(index) {
  const token = localStorage.getItem('gh_pat');
  const statusEl = document.getElementById('manage-status-message');
  if (!token) return alert("Save token first!");

  const titleVal = document.getElementById(`edit-title-${index}`).value.trim();
  const catVal = document.getElementById(`edit-cat-${index}`).value;
  const priceVal = document.getElementById(`edit-price-${index}`).value.trim();
  const sizeVal = document.getElementById(`edit-size-${index}`).value.trim();
  const matVal = document.getElementById(`edit-mat-${index}`).value.trim();

  localCatalog[index].title = titleVal;
  localCatalog[index].category = catVal;
  localCatalog[index].priceDisplay = priceVal;
  localCatalog[index].price = parseFloat(priceVal.replace(/[^0-9.]/g, '')) || 0;
  localCatalog[index].dimensions = sizeVal;
  localCatalog[index].materials = matVal;

  statusEl.style.color = "#007aff";
  statusEl.innerText = `Saving changes for "${titleVal}"...`;

  try {
    const updatedJsonB64 = btoa(unescape(encodeURIComponent(JSON.stringify(localCatalog, null, 2))));
    const res = await uploadFileToGitHub('data/paintings.json', updatedJsonB64, `Update entry: ${titleVal}`, token, catalogSha);
    catalogSha = res.content.sha;

    statusEl.style.color = "#2e7d32";
    statusEl.innerText = `Saved changes for "${titleVal}" successfully!`;
  } catch (err) {
    console.error(err);
    statusEl.style.color = "#d32f2f";
    statusEl.innerText = "Error saving changes: " + err.message;
  }
}

async function deleteItem(index) {
  const item = localCatalog[index];
  if (!confirm(`Are you sure you want to delete "${item.title}" from the catalog?`)) return;

  const token = localStorage.getItem('gh_pat');
  const statusEl = document.getElementById('manage-status-message');
  if (!token) return alert("Save token first!");

  statusEl.style.color = "#d32f2f";
  statusEl.innerText = `Deleting "${item.title}"...`;

  localCatalog.splice(index, 1);

  try {
    const updatedJsonB64 = btoa(unescape(encodeURIComponent(JSON.stringify(localCatalog, null, 2))));
    const res = await uploadFileToGitHub('data/paintings.json', updatedJsonB64, `Delete entry: ${item.title}`, token, catalogSha);
    catalogSha = res.content.sha;

    statusEl.style.color = "#2e7d32";
    statusEl.innerText = `Deleted successfully!`;
    fetchAndRenderCatalogList();
  } catch (err) {
    console.error(err);
    statusEl.style.color = "#d32f2f";
    statusEl.innerText = "Error deleting item: " + err.message;
  }
}

// --- GITHUB API HELPERS --- //

async function uploadFileToGitHub(path, contentBase64, commitMessage, token, sha = null) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`;
  const body = { message: commitMessage, content: contentBase64 };
  if (sha) body.sha = sha;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.message || 'GitHub Action Failed');
  }
  return await res.json();
}

async function getFileFromGitHub(path, token) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`;
  const res = await fetch(url, { headers: { 'Authorization': `token ${token}` } });
  if (!res.ok) throw new Error("Could not find " + path);
  return await res.json();
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
