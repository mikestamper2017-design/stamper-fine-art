const REPO_OWNER = "mikestamper2017-design";
const REPO_NAME = "stamper-fine-art";

// Tracks instances per slot: [{ file, cropper, b64Data, origSize }]
let photosState = [];

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
  photosState[index].b64Data = null; // reset cropped state

  const reader = new FileReader();
  reader.onload = (e) => {
    const previewWrapper = document.getElementById(`preview-wrapper-${index}`);
    const cropImg = document.getElementById(`img-crop-${index}`);
    
    // Destroy previous cropper instance if re-selecting photo
    if (photosState[index].cropper) {
      photosState[index].cropper.destroy();
    }

    cropImg.src = e.target.result;
    previewWrapper.style.display = 'block';

    // Initialize Cropper.js
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
  const item = photosState[index];
  if (item.cropper) {
    item.cropper.rotate(90);
  }
}

function applyCrop(index) {
  const item = photosState[index];
  if (!item.cropper) return;

  // Render cropped canvas limited to maximum 1600px dimension
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
  if (!token) {
    alert("Please save your GitHub Access Token first.");
    return;
  }

  // Ensure all selected photos have had "Apply Crop" tapped
  const uncropped = photosState.filter(p => p.file !== null && p.b64Data === null);
  if (uncropped.length > 0) {
    alert("Please tap 'Apply Crop & Save' for each photo before publishing.");
    return;
  }

  const activePhotos = photosState.filter(p => p.b64Data !== null);
  if (activePhotos.length === 0) {
    alert("Please select or capture at least one photo.");
    return;
  }

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

    // 1. Upload photos sequentially
    for (let i = 0; i < activePhotos.length; i++) {
      const suffix = i === 0 ? 'front' : `view-${i + 1}`;
      const filename = `${cleanSlug}-${suffix}-${timestamp}.jpg`;
      const imagePath = `assets/images/${filename}`;

      statusEl.innerText = `Uploading cropped photo ${i + 1} of ${activePhotos.length}...`;
      await uploadFileToGitHub(imagePath, activePhotos[i].b64Data, `Add image ${i + 1}: ${title}`, token);
      uploadedImagePaths.push(imagePath);
    }

    // 2. Fetch current paintings.json
    statusEl.innerText = "Updating catalog database...";
    const jsonPath = `data/paintings.json`;
    const jsonFileData = await getFileFromGitHub(jsonPath, token);
    const paintingsList = JSON.parse(atob(jsonFileData.content));

    const priceStr = document.getElementById('art-price').value.trim();
    const numericPrice = parseFloat(priceStr.replace(/[^0-9.]/g, '')) || 0;

    // 3. Append Entry
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

    // 4. Save updated catalog JSON
    const updatedJsonB64 = btoa(unescape(encodeURIComponent(JSON.stringify(paintingsList, null, 2))));
    await uploadFileToGitHub(jsonPath, updatedJsonB64, `Add metadata: ${title}`, token, jsonFileData.sha);

    statusEl.style.color = "#2e7d32";
    statusEl.innerText = "Success! Published to catalog.";

    // Reset forms and cropper instances
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
    throw new Error(errorData.message || 'GitHub Upload Failed');
  }
  return await res.json();
}

async function getFileFromGitHub(path, token) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`;
  const res = await fetch(url, { headers: { 'Authorization': `token ${token}` } });
  if (!res.ok) throw new Error("Could not find " + path);
  return await res.json();
}
