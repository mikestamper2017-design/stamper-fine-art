const REPO_OWNER = "mikestamper2017-design";
const REPO_NAME = "stamper-fine-art";

// Tracks photos: [{ file, rotation, b64Data, origSize, blobSize }]
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
  // Initialize with one photo slot
  addPhotoSlot();
});

function addPhotoSlot() {
  const index = photosState.length;
  photosState.push({ file: null, rotation: 0, b64Data: null, origSize: 0 });

  const container = document.getElementById('photos-list');
  const slotDiv = document.createElement('div');
  slotDiv.className = 'photo-card';
  slotDiv.id = `photo-slot-${index}`;

  const labelText = index === 0 ? "Main Photo (Front)" : `Additional Photo #${index + 1} (Back / Detail)`;

  slotDiv.innerHTML = `
    <label style="font-size:15px; font-weight:bold;">${labelText}</label>
    <input type="file" accept="image/*" capture="environment" onchange="handleFileSelect(event, ${index})">
    <div id="preview-wrapper-${index}" style="display:none;">
      <img id="img-preview-${index}" src="" alt="Preview">
      <button type="button" class="btn-rotate" onclick="rotatePhoto(${index})">Rotate 90°</button>
      <div id="stats-${index}" style="font-size:14px; font-weight:600; color:#2e7d32; margin-top:6px;"></div>
    </div>
  `;
  container.appendChild(slotDiv);
}

function handleFileSelect(event, index) {
  const file = event.target.files[0];
  if (!file) return;

  photosState[index].file = file;
  photosState[index].origSize = file.size;
  photosState[index].rotation = 0;

  const reader = new FileReader();
  reader.onload = (e) => {
    const imgObj = new Image();
    imgObj.onload = () => {
      photosState[index].imgObj = imgObj;
      processPhoto(index);
    };
    imgObj.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function rotatePhoto(index) {
  if (!photosState[index].imgObj) return;
  photosState[index].rotation = (photosState[index].rotation + 90) % 360;
  processPhoto(index);
}

function processPhoto(index) {
  const item = photosState[index];
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  let width = item.imgObj.width;
  let height = item.imgObj.height;

  const maxDim = 1600;
  if (width > maxDim || height > maxDim) {
    if (width > height) {
      height = Math.round((height * maxDim) / width);
      width = maxDim;
    } else {
      width = Math.round((width * maxDim) / height);
      height = maxDim;
    }
  }

  if (item.rotation === 90 || item.rotation === 270) {
    canvas.width = height;
    canvas.height = width;
  } else {
    canvas.width = width;
    canvas.height = height;
  }

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((item.rotation * Math.PI) / 180);

  if (item.rotation === 90 || item.rotation === 270) {
    ctx.drawImage(item.imgObj, -height / 2, -width / 2, height, width);
  } else {
    ctx.drawImage(item.imgObj, -width / 2, -height / 2, width, height);
  }
  ctx.restore();

  canvas.toBlob((blob) => {
    const previewWrapper = document.getElementById(`preview-wrapper-${index}`);
    const previewImg = document.getElementById(`img-preview-${index}`);
    previewImg.src = URL.createObjectURL(blob);
    previewWrapper.style.display = 'block';

    const origMB = (item.origSize / (1024 * 1024)).toFixed(2);
    const newKB = (blob.size / 1024).toFixed(1);
    document.getElementById(`stats-${index}`).innerText = 
      `Compressed: ${newKB} KB (Down from ${origMB} MB)`;

    const b64Reader = new FileReader();
    b64Reader.onloadend = () => {
      photosState[index].b64Data = b64Reader.result.split(',')[1];
    };
    b64Reader.readAsDataURL(blob);
  }, 'image/jpeg', 0.8);
}

async function handleUpload(event) {
  event.preventDefault();
  const token = localStorage.getItem('gh_pat');
  if (!token) {
    alert("Please save your GitHub Access Token first.");
    return;
  }

  // Filter to slots that actually have an image ready
  const activePhotos = photosState.filter(p => p.b64Data !== null);
  if (activePhotos.length === 0) {
    alert("Please select or capture at least one photo.");
    return;
  }

  const statusEl = document.getElementById('status-message');
  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;
  statusEl.style.color = "#007aff";
  statusEl.innerText = `Publishing artwork (${activePhotos.length} photos)...`;

  try {
    const title = document.getElementById('art-title').value.trim();
    const cleanSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const timestamp = Date.now();
    const uploadedImagePaths = [];

    // 1. Upload each photo sequentially
    for (let i = 0; i < activePhotos.length; i++) {
      const suffix = i === 0 ? 'front' : `view-${i + 1}`;
      const filename = `${cleanSlug}-${suffix}-${timestamp}.jpg`;
      const imagePath = `assets/images/${filename}`;

      statusEl.innerText = `Uploading photo ${i + 1} of ${activePhotos.length}...`;
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
      images: uploadedImagePaths, // Array of photo paths
      dateAdded: new Date().toISOString()
    };

    paintingsList.unshift(newEntry);

    // 4. Save updated catalog JSON
    const updatedJsonB64 = btoa(unescape(encodeURIComponent(JSON.stringify(paintingsList, null, 2))));
    await uploadFileToGitHub(jsonPath, updatedJsonB64, `Add metadata: ${title}`, token, jsonFileData.sha);

    statusEl.style.color = "#2e7d32";
    statusEl.innerText = "Success! Published to catalog.";
    
    // Reset state
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
