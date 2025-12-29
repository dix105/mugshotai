document.addEventListener('DOMContentLoaded', () => {

    // ============================================================================
    // --- 1. CONFIGURATION & STATE ---
    // ============================================================================
    
    const API_CONFIG = {
        userId: 'DObRu1vyStbUynoQmTcHBlhs55z2',
        effectId: 'mugshot',
        model: 'image-effects',
        toolType: 'image-effects'
    };

    let currentUploadedUrl = null;

    // ============================================================================
    // --- 2. BACKEND API FUNCTIONS ---
    // ============================================================================

    // Generate nanoid for unique filename
    function generateNanoId(length = 21) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // Upload file to CDN storage (called immediately when file is selected)
    async function uploadFile(file) {
        const fileExtension = file.name.split('.').pop() || 'jpg';
        const uniqueId = generateNanoId();
        // Filename is just nanoid.extension
        const fileName = uniqueId + '.' + fileExtension;
        
        // Step 1: Get signed URL from API
        const signedUrlResponse = await fetch(
            'https://api.chromastudio.ai/get-emd-upload-url?fileName=' + encodeURIComponent(fileName),
            { method: 'GET' }
        );
        
        if (!signedUrlResponse.ok) {
            throw new Error('Failed to get signed URL: ' + signedUrlResponse.statusText);
        }
        
        const signedUrl = await signedUrlResponse.text();
        
        // Step 2: PUT file to signed URL
        const uploadResponse = await fetch(signedUrl, {
            method: 'PUT',
            body: file,
            headers: {
                'Content-Type': file.type
            }
        });
        
        if (!uploadResponse.ok) {
            throw new Error('Failed to upload file: ' + uploadResponse.statusText);
        }
        
        // Step 3: Return download URL
        // Domain: contents.maxstudio.ai
        const downloadUrl = 'https://contents.maxstudio.ai/' + fileName;
        return downloadUrl;
    }

    // Submit generation job
    async function submitImageGenJob(imageUrl) {
        const isVideo = API_CONFIG.model === 'video-effects';
        const endpoint = isVideo ? 'https://api.chromastudio.ai/video-gen' : 'https://api.chromastudio.ai/image-gen';
        
        const headers = {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'sec-ch-ua-platform': '"Windows"',
            'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
            'sec-ch-ua-mobile': '?0'
        };

        // Construct payload based on type
        let body = {};
        if (isVideo) {
            body = {
                imageUrl: [imageUrl],
                effectId: API_CONFIG.effectId,
                userId: API_CONFIG.userId,
                removeWatermark: true,
                model: 'video-effects',
                isPrivate: true
            };
        } else {
            body = {
                model: API_CONFIG.model,
                toolType: API_CONFIG.toolType,
                effectId: API_CONFIG.effectId,
                imageUrl: imageUrl,
                userId: API_CONFIG.userId,
                removeWatermark: true,
                isPrivate: true
            };
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            throw new Error('Failed to submit job: ' + response.statusText);
        }
        
        const data = await response.json();
        return data;
    }

    // Poll job status until completed or failed
    const POLL_INTERVAL = 2000; // 2 seconds
    const MAX_POLLS = 60; // Max 2 minutes

    async function pollJobStatus(jobId) {
        const isVideo = API_CONFIG.model === 'video-effects';
        const baseUrl = isVideo ? 'https://api.chromastudio.ai/video-gen' : 'https://api.chromastudio.ai/image-gen';
        let polls = 0;
        
        while (polls < MAX_POLLS) {
            const response = await fetch(
                `${baseUrl}/${API_CONFIG.userId}/${jobId}/status`,
                {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json, text/plain, */*'
                    }
                }
            );
            
            if (!response.ok) {
                throw new Error('Failed to check status: ' + response.statusText);
            }
            
            const data = await response.json();
            
            if (data.status === 'completed') {
                return data;
            }
            
            if (data.status === 'failed' || data.status === 'error') {
                throw new Error(data.error || 'Job processing failed');
            }
            
            // Update UI with progress
            updateStatus('PROCESSING... (' + (polls + 1) + ')');
            
            // Wait before next poll
            await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
            polls++;
        }
        
        throw new Error('Job timed out after ' + MAX_POLLS + ' polls');
    }

    // ============================================================================
    // --- 3. UI HELPER FUNCTIONS ---
    // ============================================================================

    function showLoading() {
        const loader = document.getElementById('loading-state');
        const resultContainer = document.getElementById('result-container') || document.querySelector('.result-display');
        const placeholder = document.querySelector('.placeholder-text');
        
        if (loader) {
            loader.style.display = 'flex';
            loader.classList.remove('hidden');
        }
        if (placeholder) placeholder.classList.add('hidden');
        if (resultContainer) resultContainer.classList.add('loading');
    }

    function hideLoading() {
        const loader = document.getElementById('loading-state');
        const resultContainer = document.getElementById('result-container') || document.querySelector('.result-display');
        
        if (loader) {
            loader.style.display = 'none';
            loader.classList.add('hidden');
        }
        if (resultContainer) resultContainer.classList.remove('loading');
    }

    function updateStatus(text) {
        // Try to find a status text element, creating one if needed for the loader
        let statusText = document.querySelector('#loading-state p');
        if (!statusText) {
             statusText = document.getElementById('status-text');
        }
        
        if (statusText) statusText.textContent = text;
        
        // Update button text/state
        const generateBtn = document.getElementById('generate-btn');
        if (generateBtn) {
            if (text.includes('PROCESSING') || text.includes('UPLOADING') || text.includes('SUBMITTING')) {
                generateBtn.disabled = true;
                generateBtn.textContent = text;
            } else if (text === 'READY' || text === 'COMPLETE') {
                generateBtn.disabled = false;
                generateBtn.textContent = 'APPLY EFFECT'; // Reset to original text
            }
        }
    }

    function showError(msg) {
        alert('Error: ' + msg); 
        console.error(msg);
    }

    function showPreview(url) {
        const img = document.getElementById('preview-image');
        const uploadContent = document.querySelector('.upload-content');
        
        if (img) {
            img.src = url;
            img.classList.remove('hidden');
            img.style.display = 'block';
        }
        if (uploadContent) {
            uploadContent.classList.add('hidden');
        }
    }

    function showResultMedia(url) {
        const resultImg = document.getElementById('result-final');
        const container = document.getElementById('result-container');
        const actionButtons = document.getElementById('result-actions');
        
        if (!container) return;
        
        // Show container and actions
        container.classList.remove('hidden');
        if (actionButtons) actionButtons.classList.remove('hidden');

        const isVideo = url.toLowerCase().match(/\.(mp4|webm)(\?.*)?$/i);
        
        if (isVideo) {
            // Hide image
            if (resultImg) {
                resultImg.style.display = 'none';
                resultImg.classList.add('hidden');
            }
            
            // Show/Create video
            let video = document.getElementById('result-video');
            if (!video) {
                video = document.createElement('video');
                video.id = 'result-video';
                video.controls = true;
                video.autoplay = true;
                video.loop = true;
                // Replaced undefined Tailwind classes with CSS styles
                video.className = resultImg ? resultImg.className : 'result-media-content';
                video.style.width = '100%';
                video.style.height = 'auto';
                if (!resultImg) video.style.borderRadius = '0.5rem';

                video.style.maxWidth = '100%';
                // Insert before the image or append to container
                if (resultImg) {
                    container.insertBefore(video, resultImg);
                } else {
                    container.appendChild(video);
                }
            }
            video.src = url;
            video.style.display = 'block';
        } else {
            // Hide video
            const video = document.getElementById('result-video');
            if (video) video.style.display = 'none';
            
            // Show image
            if (resultImg) {
                resultImg.classList.remove('hidden');
                resultImg.style.display = 'block';
                resultImg.crossOrigin = 'anonymous';
                resultImg.src = url;
            }
        }
    }

    function showDownloadButton(url) {
        const downloadBtn = document.getElementById('download-btn');
        if (downloadBtn) {
            downloadBtn.dataset.url = url;
        }
    }

    function enableGenerateButton() {
        const generateBtn = document.getElementById('generate-btn');
        if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.classList.remove('hidden');
        }
    }

    // ============================================================================
    // --- 4. MAIN WORKFLOW HANDLERS ---
    // ============================================================================

    // Handler when file is selected - uploads immediately
    async function handleFileSelect(file) {
        try {
            // UI Setup
            showLoading();
            updateStatus('UPLOADING...');
            
            // Upload
            const uploadedUrl = await uploadFile(file);
            currentUploadedUrl = uploadedUrl;
            
            // Show Preview
            showPreview(uploadedUrl);
            
            updateStatus('READY');
            hideLoading();
            
            enableGenerateButton();
            
        } catch (error) {
            hideLoading();
            updateStatus('ERROR');
            showError(error.message);
        }
    }

    // Handler when Generate button is clicked
    async function handleGenerate() {
        if (!currentUploadedUrl) {
            alert('Please upload a photo first.');
            return;
        }
        
        try {
            // UI Setup
            const placeholder = document.querySelector('.placeholder-text');
            const resultImg = document.getElementById('result-final');
            const actionButtons = document.getElementById('result-actions');
            
            if (placeholder) placeholder.classList.add('hidden');
            if (resultImg) resultImg.classList.add('hidden');
            if (actionButtons) actionButtons.classList.add('hidden');
            
            showLoading();
            updateStatus('SUBMITTING JOB...');
            
            // Step 1: Submit job
            const jobData = await submitImageGenJob(currentUploadedUrl);
            
            updateStatus('JOB QUEUED...');
            
            // Step 2: Poll for completion
            const result = await pollJobStatus(jobData.jobId);
            
            // Step 3: Extract Result URL
            const resultItem = Array.isArray(result.result) ? result.result[0] : result.result;
            const resultUrl = resultItem?.mediaUrl || resultItem?.video || resultItem?.image;
            
            if (!resultUrl) {
                console.error('Response:', result);
                throw new Error('No image URL in response');
            }
            
            currentUploadedUrl = resultUrl; // Update for download
            
            // Step 4: Display Result
            showResultMedia(resultUrl);
            showDownloadButton(resultUrl);
            
            updateStatus('COMPLETE');
            hideLoading();
            
        } catch (error) {
            hideLoading();
            updateStatus('ERROR');
            showError(error.message);
            // Revert UI if needed
            const generateBtn = document.getElementById('generate-btn');
            if(generateBtn) {
                generateBtn.disabled = false;
                generateBtn.textContent = 'APPLY EFFECT';
            }
        }
    }

    // ============================================================================
    // --- 5. EVENT LISTENERS & WIRING ---
    // ============================================================================

    const dropZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    const generateBtn = document.getElementById('generate-btn');
    const downloadBtn = document.getElementById('download-btn');
    const resetBtn = document.getElementById('reset-btn');

    // --- File Input Wiring ---
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) handleFileSelect(file);
        });
    }

    // --- Drag & Drop Wiring ---
    if (dropZone) {
        // Prevent defaults
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });

        // Visual cues
        dropZone.addEventListener('dragover', () => dropZone.classList.add('drag-over'));
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
        dropZone.addEventListener('drop', (e) => {
            dropZone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file) handleFileSelect(file);
        });
        
        // Click to upload (if not clicking a button inside)
        dropZone.addEventListener('click', (e) => {
            if (fileInput && e.target !== fileInput && !e.target.closest('button')) {
                fileInput.click();
            }
        });
    }

    // --- Generate Button Wiring ---
    if (generateBtn) {
        generateBtn.addEventListener('click', handleGenerate);
    }

    // --- Download Button Wiring (Robust Strategy) ---
    if (downloadBtn) {
        downloadBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const url = downloadBtn.dataset.url;
            if (!url) return;
            
            const originalText = downloadBtn.textContent;
            downloadBtn.textContent = 'Downloading...';
            downloadBtn.disabled = true;
            
            try {
                // Strategy 1: Fetch as Blob
                const response = await fetch(url, {
                    mode: 'cors',
                    credentials: 'omit'
                });
                
                if (!response.ok) throw new Error('Network response not ok');
                
                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);
                
                // Determine extension
                const contentType = response.headers.get('content-type') || '';
                let extension = 'jpg';
                if (contentType.includes('video') || url.match(/\.(mp4|webm)/i)) extension = 'mp4';
                else if (contentType.includes('png') || url.match(/\.png/i)) extension = 'png';
                else if (contentType.includes('webp') || url.match(/\.webp/i)) extension = 'webp';
                
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = 'chroma_result_' + generateNanoId(8) + '.' + extension;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
                
            } catch (err) {
                console.error('Download Strategy 1 failed:', err);
                
                // Strategy 2: Canvas Fallback (Images only)
                try {
                    const img = document.getElementById('result-final');
                    if (img && img.style.display !== 'none' && img.complete && img.naturalWidth > 0) {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.naturalWidth;
                        canvas.height = img.naturalHeight;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        
                        canvas.toBlob((blob) => {
                            if (blob) {
                                const link = document.createElement('a');
                                link.href = URL.createObjectURL(blob);
                                link.download = 'chroma_result_' + generateNanoId(8) + '.png';
                                link.click();
                                setTimeout(() => URL.revokeObjectURL(link.href), 1000);
                            } else {
                                throw new Error('Canvas blob failed');
                            }
                        }, 'image/png');
                        return; // Success
                    }
                } catch (canvasErr) {
                    console.error('Download Strategy 2 failed:', canvasErr);
                }
                
                // Strategy 3: New Tab Fallback
                alert('Direct download failed. Opening in new tab - please right click and Save As.');
                window.open(url, '_blank');
            } finally {
                downloadBtn.textContent = originalText;
                downloadBtn.disabled = false;
            }
        });
    }

    // --- Reset Button Wiring ---
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            currentUploadedUrl = null;
            
            // Reset Preview
            const img = document.getElementById('preview-image');
            if (img) {
                img.src = '';
                img.classList.add('hidden');
            }
            
            // Reset Upload Zone text
            const uploadContent = document.querySelector('.upload-content');
            if (uploadContent) uploadContent.classList.remove('hidden');
            
            // Reset Result Area
            const resultImg = document.getElementById('result-final');
            const video = document.getElementById('result-video');
            if (resultImg) {
                resultImg.classList.add('hidden');
                resultImg.src = '';
            }
            if (video) {
                video.style.display = 'none';
                video.src = '';
            }
            
            // Reset Placeholders & Actions
            const placeholder = document.querySelector('.placeholder-text');
            const actionButtons = document.getElementById('result-actions');
            if (placeholder) placeholder.classList.remove('hidden');
            if (actionButtons) actionButtons.classList.add('hidden');
            
            // Reset Buttons
            if (generateBtn) {
                generateBtn.classList.remove('hidden');
                generateBtn.disabled = false;
                generateBtn.textContent = 'APPLY EFFECT';
            }
            
            if (fileInput) fileInput.value = '';
            
            hideLoading();
        });
    }

    // ============================================================================
    // --- 6. EXISTING UI INTERACTION LOGIC (Menus, FAQ, Modals) ---
    // ============================================================================

    // --- Mobile Menu Toggle ---
    const menuToggle = document.querySelector('.menu-toggle');
    const nav = document.querySelector('header nav');
    
    if(menuToggle && nav) {
        menuToggle.addEventListener('click', () => {
            nav.classList.toggle('active');
            menuToggle.textContent = nav.classList.contains('active') ? '✕' : '☰';
        });
        
        // Close menu when clicking links
        document.querySelectorAll('header nav a').forEach(link => {
            link.addEventListener('click', () => {
                nav.classList.remove('active');
                menuToggle.textContent = '☰';
            });
        });
    }

    // --- FAQ Accordion ---
    const faqQuestions = document.querySelectorAll('.faq-question');
    faqQuestions.forEach(btn => {
        btn.addEventListener('click', () => {
            const answer = btn.nextElementSibling;
            const isOpen = btn.classList.contains('active');
            
            // Close all others
            document.querySelectorAll('.faq-question').forEach(otherBtn => {
                otherBtn.classList.remove('active');
                otherBtn.nextElementSibling.style.maxHeight = null;
            });

            if (!isOpen) {
                btn.classList.add('active');
                answer.style.maxHeight = answer.scrollHeight + "px";
            }
        });
    });

    // --- Modals ---
    const openModalBtns = document.querySelectorAll('[data-modal-target]');
    const closeModalBtns = document.querySelectorAll('[data-modal-close]');
    
    openModalBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const modalId = btn.getAttribute('data-modal-target') + '-modal';
            const modal = document.getElementById(modalId);
            if(modal) modal.classList.remove('hidden');
        });
    });

    closeModalBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal');
            modal.classList.add('hidden');
        });
    });

    window.addEventListener('click', (e) => {
        if(e.target.classList.contains('modal')) {
            e.target.classList.add('hidden');
        }
    });

    // --- Smooth Scroll for Anchors ---
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if(target) {
                target.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });

});