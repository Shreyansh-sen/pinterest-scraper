let currentImages = [];
let selectedImages = new Set();
let generatedVideos = [];
let currentBatchId = null;

const BACKEND_URL = 'http://localhost:2000';

// DOM Elements
const urlInput = document.getElementById('urlInput');
const scrapeBtn = document.getElementById('scrapeBtn');
const loadingContainer = document.getElementById('loadingContainer');
const errorContainer = document.getElementById('errorContainer');
const errorText = document.getElementById('errorText');
const imagesSection = document.getElementById('imagesSection');
const imagesGrid = document.getElementById('imagesGrid');
const promptSection = document.getElementById('promptSection');
const customPromptInput = document.getElementById('customPromptInput');
const generateBtn = document.getElementById('generateBtn');
const generatedVideosSection = document.getElementById('generatedVideosSection');
const generatedVideosGrid = document.getElementById('generatedVideosGrid');
const progressSection = document.getElementById('progressSection');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');

// Event listeners
scrapeBtn.addEventListener('click', scrapeMedia);
if (generateBtn) generateBtn.addEventListener('click', startVideoGeneration);
if (urlInput) {
    urlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') scrapeMedia();
    });
}


// Scrape Pinterest
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

    showLoading('🔍 Scanning Pinterest board...');
    scrapeBtn.disabled = true;
    hideError();

    try {
        // Call the local pinterst-scraper endpoint
        const response = await fetch(`/api/scrape`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to scrape');
        }

        currentImages = data.images || [];
        selectedImages.clear();

        if (currentImages.length === 0) {
            throw new Error('No images found on this Pinterest board');
        }

        hideLoading();
        displayImages();
        showPromptSection();
    } catch (error) {
        showError(`Failed to scrape Pinterest: ${error.message}`);
    } finally {
        scrapeBtn.disabled = false;
    }
}

// Display scraped images
function displayImages() {
    imagesSection.classList.remove('hidden');
    imagesGrid.innerHTML = '';
    
    document.getElementById('imageCount').textContent = currentImages.length;

    currentImages.forEach((imageUrl, index) => {
        const card = document.createElement('div');
        card.className = 'image-card';

        card.innerHTML = `
            <img class="image-thumbnail" src="${imageUrl}" alt="Pinterest image" loading="lazy">
            <div class="image-card-checkbox">
                <input type="checkbox" data-index="${index}">
            </div>
            <div class="image-actions">
                <button class="preview-btn" onclick='previewImage(${JSON.stringify(imageUrl)})'>👁️ Preview</button>
            </div>
        `;

        const checkbox = card.querySelector('input[type="checkbox"]');
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                selectedImages.add(index);
                card.classList.add('selected');
            } else {
                selectedImages.delete(index);
                card.classList.remove('selected');
            }
            updateSelectedCount();
        });

        imagesGrid.appendChild(card);
    });

    // Add select all button
    const selectAllBtn = document.createElement('button');
    selectAllBtn.className = 'select-all-btn';
    selectAllBtn.textContent = '✓ Select All';
    selectAllBtn.onclick = () => {
        const allChecked = selectedImages.size === currentImages.length;
        selectedImages.clear();
        document.querySelectorAll('#imagesGrid input[type="checkbox"]').forEach((cb, idx) => {
            cb.checked = !allChecked;
            if (!allChecked) selectedImages.add(idx);
        });
        document.querySelectorAll('#imagesGrid .image-card').forEach((card, idx) => {
            if (!allChecked) card.classList.add('selected');
            else card.classList.remove('selected');
        });
        updateSelectedCount();
    };
    imagesGrid.parentElement.insertBefore(selectAllBtn, imagesGrid);

    updateSelectedCount();
}

// Show prompt input section
function showPromptSection() {
    promptSection.classList.remove('hidden');
    customPromptInput.focus();
}

// Start video generation
async function startVideoGeneration() {
    const selectedImageUrls = Array.from(selectedImages).map((idx) => currentImages[idx]);
    const customPrompt = customPromptInput.value.trim();

    if (selectedImageUrls.length === 0) {
        showError('Please select at least one image');
        return;
    }

    if (!customPrompt) {
        showError('Please enter a custom prompt for video generation');
        return;
    }

    const totalVideos = selectedImageUrls.length * 2;
    showLoading(`🎬 Starting generation of ${totalVideos} videos (2 per image)...`);
    generateBtn.disabled = true;
    
    // Clear previous videos
    generatedVideos = [];

    try {
        const response = await fetch(`${BACKEND_URL}/generate-batch-videos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                selected_images: selectedImageUrls,
                custom_prompt: customPrompt
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to start generation');
        }

        currentBatchId = data.batch_id;
        hideLoading();
        
        // Redirect to wallpaper pipeline batch view
        window.location.href = `${BACKEND_URL}/batch-view?batch_id=${currentBatchId}`;
    } catch (error) {
        showError(`Failed to start generation: ${error.message}`);
        generateBtn.disabled = false;
    }
}

// Show progress tracking
function showProgressSection() {
    progressSection.classList.remove('hidden');
    generatedVideosSection.classList.add('hidden');
}

// Monitor batch generation progress
async function monitorProgress() {
    if (!currentBatchId) return;

    const pollInterval = setInterval(async () => {
        try {
            const response = await fetch(`${BACKEND_URL}/batch-progress/${currentBatchId}`);
            const progress = await response.json();

            if (response.ok) {
                const { status, total_videos, generated_count, videos } = progress;
                const percentage = total_videos > 0 ? Math.round((generated_count / total_videos) * 100) : 0;

                progressBar.style.width = percentage + '%';
                progressText.textContent = `${generated_count} / ${total_videos} videos generated`;

                if (status === 'completed' || status === 'error') {
                    clearInterval(pollInterval);
                    generateBtn.disabled = false;

                    if (status === 'completed') {
                        showLoading('✅ Generation complete! Preparing display...');
                        setTimeout(() => {
                            hideLoading();
                            displayGeneratedVideos(videos);
                        }, 1000);
                    } else {
                        showError('Generation encountered an error. Check server logs.');
                    }
                }
            }
        } catch (error) {
            console.error('Progress poll error:', error);
        }
    }, 2000); // Poll every 2 seconds
}

// Display generated videos
function displayGeneratedVideos(videos) {
    progressSection.classList.add('hidden');
    generatedVideosSection.classList.remove('hidden');
    generatedVideosGrid.innerHTML = '';

    if (!videos || videos.length === 0) {
        generatedVideosSection.innerHTML = '<p>No videos were generated.</p>';
        return;
    }

    document.getElementById('generatedVideoCount').textContent = videos.length;

    videos.forEach((video, idx) => {
        const card = document.createElement('div');
        card.className = 'video-card';

        const videoPath = video.video_url || video.video_path;
        const videoName = videoPath ? videoPath.split('/').pop() : `video-${idx + 1}.mp4`;

        card.innerHTML = `
            <div class="video-info">
                <strong>Variant ${video.variant || idx + 1}</strong>
                <p class="video-prompt">${video.prompt || 'No prompt'}</p>
            </div>
            <div class="video-actions">
                <button class="preview-btn" onclick='previewVideo(${JSON.stringify(videoPath)})'>👁️ Preview</button>
                <button class="download-btn" onclick='downloadVideo(${JSON.stringify(videoPath)}, ${JSON.stringify(videoName)})'>⬇️ Download</button>
            </div>
        `;

        generatedVideosGrid.appendChild(card);
    });
}

// Preview image
function previewImage(url) {
    const modal = document.createElement('div');
    modal.className = 'preview-modal';
    modal.innerHTML = `
        <div class="preview-content">
            <span class="close-btn" onclick="this.parentElement.parentElement.remove()">✕</span>
            <img src="${url}" alt="Preview" style="max-width: 90%; max-height: 90%;">
        </div>
    `;
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    document.body.appendChild(modal);
}

// Preview video
function previewVideo(url) {
    const modal = document.createElement('div');
    modal.className = 'preview-modal';
    modal.innerHTML = `
        <div class="preview-content">
            <span class="close-btn" onclick="this.parentElement.parentElement.remove()">✕</span>
            <video controls style="max-width: 90%; max-height: 90%;">
                <source src="${url}" type="video/mp4">
            </video>
        </div>
    `;
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    document.body.appendChild(modal);
}

// Download video
function downloadVideo(url, filename) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'video.mp4';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Update selected count
function updateSelectedCount() {
    const selectedBtn = document.querySelector('.select-all-btn');
    if (selectedBtn) {
        selectedBtn.textContent = selectedImages.size === currentImages.length ? 
            `✓ Deselect All (${selectedImages.size}/${currentImages.length})` : 
            `✓ Select All (${selectedImages.size}/${currentImages.length})`;
    }
    if (generateBtn) {
        generateBtn.disabled = selectedImages.size === 0;
    }
}

// UI Helpers
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

function hideError() {
    errorContainer.classList.add('hidden');
}
