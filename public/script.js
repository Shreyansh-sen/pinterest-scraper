let currentMedia = { images: [], videos: [] };
let selectedMedia = { images: new Set(), videos: new Set() };
let currentPreviewData = null;

const urlInput = document.getElementById('urlInput');
const scrapeBtn = document.getElementById('scrapeBtn');
const loadingContainer = document.getElementById('loadingContainer');
const errorContainer = document.getElementById('errorContainer');
const errorText = document.getElementById('errorText');
const videosSection = document.getElementById('videosSection');
const imagesSection = document.getElementById('imagesSection');
const downloadSection = document.getElementById('downloadSection');
const videosGrid = document.getElementById('videosGrid');
const imagesGrid = document.getElementById('imagesGrid');
const previewModal = document.getElementById('previewModal');
const downloadModalBtn = document.getElementById('downloadModalBtn');
const statsSection = document.getElementById('statsSection');

// Scrape button click handler
scrapeBtn.addEventListener('click', scrapeMedia);

// Enter key to scrape
urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        scrapeMedia();
    }
});

async function scrapeMedia() {
    const url = urlInput.value.trim();

    if (!url) {
        showError('Please enter a Pinterest URL');
        return;
    }

    if (!url.includes('pinterest')) {
        showError('Please enter a valid Pinterest URL');
        return;
    }

    showLoading('Scanning Pinterest board...');
    scrapeBtn.disabled = true;

    try {
        const response = await fetch('/api/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to scrape');
        }

        currentMedia = {
            images: data.images || [],
            videos: data.videos || []
        };

        selectedMedia = {
            images: new Set(),
            videos: new Set()
        };

        hideLoading();
        displayMedia();
    } catch (error) {
        showError(error.message);
    } finally {
        scrapeBtn.disabled = false;
    }
}

function displayMedia() {
    // Display videos
    if (currentMedia.videos.length > 0) {
        videosSection.classList.remove('hidden');
        document.getElementById('videoCount').textContent = currentMedia.videos.length;
        videosGrid.innerHTML = '';

        currentMedia.videos.forEach((videoUrl, index) => {
            const card = createMediaCard(videoUrl, index, 'video');
            videosGrid.appendChild(card);
        });

        const selectAllVideosBtn = document.getElementById('selectAllVideosBtn');
        if (selectAllVideosBtn) {
            selectAllVideosBtn.onclick = () => {
                const allChecked = videosGrid.querySelectorAll('input[type="checkbox"]').length ===
                                  Array.from(videosGrid.querySelectorAll('input[type="checkbox"]')).filter(cb => cb.checked).length;

                videosGrid.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                    checkbox.checked = !allChecked;
                    const index = parseInt(checkbox.dataset.index);
                    if (checkbox.checked) {
                        selectedMedia.videos.add(index);
                    } else {
                        selectedMedia.videos.delete(index);
                    }
                });
                updateSelectedCount();
            };
        }
    } else {
        videosSection.classList.add('hidden');
    }

    // Display images
    if (currentMedia.images.length > 0) {
        imagesSection.classList.remove('hidden');
        document.getElementById('imageCount').textContent = currentMedia.images.length;
        imagesGrid.innerHTML = '';

        currentMedia.images.forEach((imageUrl, index) => {
            const card = createMediaCard(imageUrl, index, 'image');
            imagesGrid.appendChild(card);
        });

        const selectAllBtn = document.getElementById('selectAllBtn');
        if (selectAllBtn) {
            selectAllBtn.onclick = () => {
                const allChecked = imagesGrid.querySelectorAll('input[type="checkbox"]').length ===
                                  Array.from(imagesGrid.querySelectorAll('input[type="checkbox"]')).filter(cb => cb.checked).length;

                imagesGrid.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                    checkbox.checked = !allChecked;
                    const index = parseInt(checkbox.dataset.index);
                    if (checkbox.checked) {
                        selectedMedia.images.add(index);
                    } else {
                        selectedMedia.images.delete(index);
                    }
                });
                updateSelectedCount();
            };
        }
    } else {
        imagesSection.classList.add('hidden');
    }

    updateSelectedCount();
    downloadSection.classList.remove('hidden');
    const downloadBtn = document.getElementById('downloadSelectedBtn');
    if (downloadBtn) {
        downloadBtn.onclick = downloadSelected;
    }
}

function createMediaCard(url, index, type) {
    const card = document.createElement('div');
    card.className = 'media-card';

    let thumbnailHTML = '';
    if (type === 'video') {
        thumbnailHTML = `
            <video class="media-thumbnail" preload="metadata">
                <source src="${url}" type="video/mp4">
            </video>
            <div class="play-icon">▶</div>
        `;
    } else {
        thumbnailHTML = `
            <img class="media-thumbnail" src="${url}" alt="Image" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22%3E%3Crect fill=%22%23ccc%22 width=%22100%22 height=%22100%22/%3E%3C/svg%3E'">
        `;
    }

    card.innerHTML = `
        ${thumbnailHTML}
        <div class="media-badge ${type === 'video' ? 'video-badge' : 'image-badge'}">
            ${type === 'video' ? '🎬 Video' : '🖼️ Image'}
        </div>
        <div class="media-card-checkbox">
            <input type="checkbox" data-index="${index}" data-type="${type}">
        </div>
        <div class="media-actions">
            <button class="preview-btn" onclick="previewMedia('${url}', '${type}')">Preview</button>
            <button class="download-btn" onclick="downloadSingle('${url}', ${index}, '${type}')">Download</button>
        </div>
    `;

    const checkbox = card.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
            selectedMedia[type === 'video' ? 'videos' : 'images'].add(index);
            card.classList.add('selected');
        } else {
            selectedMedia[type === 'video' ? 'videos' : 'images'].delete(index);
            card.classList.remove('selected');
        }
        updateSelectedCount();
    });

    return card;
}

function previewMedia(url, type) {
    currentPreviewData = { url, type };
    const previewImage = document.getElementById('previewImage');
    const previewVideo = document.getElementById('previewVideo');

    if (type === 'video') {
        previewImage.classList.add('hidden');
        previewVideo.classList.remove('hidden');
        previewVideo.src = url;
    } else {
        previewVideo.classList.add('hidden');
        previewImage.classList.remove('hidden');
        previewImage.src = url;
    }

    previewModal.classList.remove('hidden');
}

function closePreview() {
    previewModal.classList.add('hidden');
    const previewVideo = document.getElementById('previewVideo');
    previewVideo.pause();
    previewVideo.src = '';
}

function updateSelectedCount() {
    const total = selectedMedia.images.size + selectedMedia.videos.size;
    document.getElementById('selectedCount').textContent = `${total} selected`;
    
    const selectedVideosCountEl = document.getElementById('selectedVideosCount');
    if (selectedVideosCountEl) {
        selectedVideosCountEl.textContent = `${selectedMedia.videos.size} selected`;
    }

    if (total === 0) {
        downloadSection.classList.add('hidden');
    } else {
        downloadSection.classList.remove('hidden');
    }
}

async function downloadSingle(url, index, type) {
    const btn = event.target;
    btn.disabled = true;
    btn.textContent = 'Downloading...';

    try {
        const response = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, index, type })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error);
        }

        downloadFile(data.path, data.filename);
        btn.textContent = '✓ Downloaded';
        btn.style.backgroundColor = 'var(--success-color)';
    } catch (error) {
        btn.textContent = '✗ Failed';
        btn.style.backgroundColor = 'var(--error-color)';
        showError('Failed to download: ' + error.message);
    }
}

async function downloadSelected() {
    const total = selectedMedia.images.size + selectedMedia.videos.size;

    if (total === 0) {
        showError('Please select at least one item to download');
        return;
    }

    showLoading(`Downloading ${total} items...`);
    document.getElementById('downloadSelectedBtn').disabled = true;
    statsSection.classList.remove('hidden');

    let downloaded = 0;
    let failed = 0;

    // Download selected videos
    for (const index of selectedMedia.videos) {
        const url = currentMedia.videos[index];
        try {
            const response = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, index, type: 'video' })
            });

            if (response.ok) {
                const data = await response.json();
                downloadFile(data.path, data.filename);
                downloaded++;
            } else {
                failed++;
            }
        } catch (error) {
            failed++;
        }

        updateStats(downloaded, failed, total);
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    // Download selected images
    for (const index of selectedMedia.images) {
        const url = currentMedia.images[index];
        try {
            const response = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, index, type: 'image' })
            });

            if (response.ok) {
                const data = await response.json();
                downloadFile(data.path, data.filename);
                downloaded++;
            } else {
                failed++;
            }
        } catch (error) {
            failed++;
        }

        updateStats(downloaded, failed, total);
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    hideLoading();
    document.getElementById('downloadSelectedBtn').disabled = false;
    updateStats(downloaded, failed, total);
}

function updateStats(downloaded, failed, total) {
    document.getElementById('downloadedCount').textContent = downloaded;
    document.getElementById('failedCount').textContent = failed;
    document.getElementById('totalCount').textContent = total;
    document.getElementById('loadingText').textContent = `Downloading: ${downloaded + failed}/${total}`;
}

function downloadFile(path, filename) {
    const link = document.createElement('a');
    link.href = path;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function showLoading(text) {
    document.getElementById('loadingText').textContent = text;
    loadingContainer.classList.remove('hidden');
    errorContainer.classList.add('hidden');
}

function hideLoading() {
    loadingContainer.classList.add('hidden');
}

function showError(message) {
    errorText.textContent = message;
    errorContainer.classList.remove('hidden');
}

function closeError() {
    errorContainer.classList.add('hidden');
}
