const REPO_OWNER = "mikestamper2017-design";
const REPO_NAME = "stamper-fine-art";

let originalImageObj = null;
let currentRotation = 0; // 0, 90, 180, 270 degrees
let base64Image = null;
let originalFileSize = 0;

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
});

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  originalFileSize = file.size;
  currentRotation = 0;

  const reader = new FileReader();
  reader.onload = (e) => {
    originalImageObj = new Image();
    originalImageObj.onload = () => {
      processAndDisplayImage();
    };
    originalImageObj.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function rotateImage() {
  if (!originalImageObj) return;
  currentRotation = (currentRotation + 90) % 360;
  processAndDisplayImage();
}

function processAndDisplayImage() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  let width = originalImageObj.width;
  let height = originalImageObj.height;

  // Max dimension 1600px
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

  // Swap canvas dimensions if rotated 90 or 270 deg
  if (currentRotation === 90 || currentRotation === 270) {
    canvas.width = height;
    canvas.height = width;
  } else {
    canvas.width = width;
    canvas.height = height;
  }

  // Rotate Canvas context around center
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((currentRotation * Math.PI) / 180);

  if (currentRotation === 90 || currentRotation === 270) {
    ctx.drawImage(originalImageObj, -height / 2, -width / 2, height, width);
  } else {
    ctx.drawImage(originalImageObj, -width / 2, -height / 2, width, height);
  }
  ctx.restore();

  // Compress to standard JPEG (80% quality)
  canvas.toBlob((blob) => {
    const previewContainer = document.getElementById('preview-container');
    const previewImg = document.getElementById('image-preview');
    previewImg.src = URL.createObjectURL(blob);
    previewContainer.style.display = 'block';

    const origMB = (originalFileSize / (1024 * 1024)).toFixed(2);
    const newKB = (blob.size / 1024).toFixed(1);
    document.getElementById('compression-stats').innerText = 
      `Compressed: ${newKB} KB (Reduced from ${origMB} MB)`;

    const b64Reader = new FileReader();
    b64Reader.onloadend = () => {
      base64Image = b64Reader.result.split(',')[1];
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

  if (!base64Image) {
    alert("Please select or capture a photo first.");
    return;
  }

  const statusEl = document.getElementById('status-message');
  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;
  statusEl.style.color = "#007aff";
  statusEl.innerText = "Publishing artwork to GitHub...";

  try {
    const title = document.getElementById('art-title').value.trim();
    const cleanSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const timestamp = Date.now();
    const filename = `${cleanSlug}-${timestamp}.jpg`;
    const imagePath = `assets/images/${filename}`;

    // 1. Upload Image
    await uploadFileToGitHub(imagePath, base64Image, `Add image: ${title}`, token);

    // 2. Fetch current JSON
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
      image: imagePath,
      dateAdded: new Date().toISOString()
    };

    paintingsList.unshift(newEntry);

    // 4. Save JSON back to GitHub
    const updatedJsonB64 = btoa(unescape(encodeURIComponent(JSON.stringify(paintingsList, null, 2))));
    await uploadFileToGitHub(jsonPath, updatedJsonB64, `Add metadata: ${title}`, token, jsonFileData.sha);

    statusEl.style.color = "#2e7d32";
    statusEl.innerText = "Success! Published to catalog.";
    document.getElementById('artwork-form').reset();
    document.getElementById('preview-container').style.display = 'none';
    document.getElementById('compression-stats').innerText = '';
    base64Image = null;
    originalImageObj = null;
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
