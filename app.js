// --- CONFIGURATION ---
const REPO_OWNER = "mikestamper2017-design";
const REPO_NAME = "stamper-fine-art";
let compressedBlob = null;
let base64Image = null;

// Save GitHub Token locally on device so you don't re-enter it
function saveToken() {
  const token = document.getElementById('gh-token').value.trim();
  if (token) {
    localStorage.setItem('gh_pat', token);
    alert('Token saved to browser storage!');
  }
}

// Auto-fill token field if saved
document.addEventListener('DOMContentLoaded', () => {
  const savedToken = localStorage.getItem('gh_pat');
  if (savedToken && document.getElementById('gh-token')) {
    document.getElementById('gh-token').value = savedToken;
  }
});

// In-Browser Image Compression (Canvas)
function previewAndCompress(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.src = e.target.result;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      // Resize long edge to max 2000px (Plenty for high-res web viewing)
      const maxDim = 2000;
      let width = img.width;
      let height = img.height;

      if (width > height && width > maxDim) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else if (height > maxDim) {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      // Compress to WebP at 80% quality
      canvas.toBlob((blob) => {
        compressedBlob = blob;
        const preview = document.getElementById('image-preview');
        preview.src = URL.createObjectURL(blob);
        preview.style.display = 'block';

        const origSize = (file.size / (1024 * 1024)).toFixed(2);
        const newSize = (blob.size / 1024).toFixed(1);
        document.getElementById('compression-stats').innerText = 
          `Original: ${origSize}MB | Compressed: ${newSize}KB (WebP)`;

        // Convert to Base64 for GitHub API
        const b64Reader = new FileReader();
        b64Reader.onloadend = () => {
          base64Image = b64Reader.result.split(',')[1];
        };
        b64Reader.readAsDataURL(blob);
      }, 'image/webp', 0.8);
    };
  };
  reader.readAsDataURL(file);
}

// GitHub API Commit Function
async function handleUpload(event) {
  event.preventDefault();
  const token = localStorage.getItem('gh_pat');
  if (!token) {
    alert("Please enter and save your GitHub Access Token first.");
    return;
  }

  if (!base64Image) {
    alert("Please capture or select an image.");
    return;
  }

  const statusEl = document.getElementById('status-message');
  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;
  statusEl.innerText = "Publishing artwork to GitHub...";

  try {
    const title = document.getElementById('art-title').value.trim();
    const cleanSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const timestamp = Date.now();
    const filename = `${cleanSlug}-${timestamp}.webp`;
    const imagePath = `assets/images/${filename}`;

    // 1. Upload Image to assets/images/
    await uploadFileToGitHub(imagePath, base64Image, `Add image: ${title}`, token);

    // 2. Fetch current paintings.json metadata
    const jsonPath = `data/paintings.json`;
    const jsonFileData = await getFileFromGitHub(jsonPath, token);
    const paintingsList = JSON.parse(atob(jsonFileData.content));

    // 3. Append new entry
    const newEntry = {
      id: timestamp,
      title: title,
      category: document.getElementById('art-category').value,
      dimensions: document.getElementById('art-size').value,
      materials: document.getElementById('art-materials').value,
      price: document.getElementById('art-price').value,
      image: imagePath,
      dateAdded: new Date().toISOString()
    };

    paintingsList.unshift(newEntry); // Add to top of gallery

    // 4. Update paintings.json on GitHub
    const updatedJsonB64 = btoa(unescape(encodeURIComponent(JSON.stringify(paintingsList, null, 2))));
    await uploadFileToGitHub(jsonPath, updatedJsonB64, `Add metadata: ${title}`, token, jsonFileData.sha);

    statusEl.innerText = "Success! Artwork published to site catalog.";
    document.getElementById('artwork-form').reset();
    document.getElementById('image-preview').style.display = 'none';
    document.getElementById('compression-stats').innerText = '';
    base64Image = null;
  } catch (err) {
    console.error(err);
    statusEl.innerText = "Error uploading: " + err.message;
  } finally {
    submitBtn.disabled = false;
  }
}

// Helper: GitHub REST API Upload
async function uploadFileToGitHub(path, contentBase64, commitMessage, token, sha = null) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`;
  const body = {
    message: commitMessage,
    content: contentBase64
  };
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
    throw new Error(errorData.message || 'GitHub API Upload Failed');
  }
  return await res.json();
}

// Helper: GitHub REST API Read
async function getFileFromGitHub(path, token) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `token ${token}` }
  });
  if (!res.ok) throw new Error("Could not fetch " + path);
  return await res.json();
}
