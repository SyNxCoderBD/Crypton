import { encrypt, decrypt } from 'crypto-utils';

// Defensive element selection
const getEl = (id) => document.getElementById(id);

const passwordInput = getEl('password');
const useDefaultCheckbox = getEl('use-default-key');
const textInput = getEl('text-input');
const imageInput = getEl('image-input');
const imagePreviewContainer = getEl('image-preview-container');
const imagePreview = getEl('image-preview');
const removeImageBtn = getEl('remove-image-btn');
const qualitySettings = getEl('quality-settings');
const qualitySlider = getEl('quality-slider');
const qualityValue = getEl('quality-value');
const progressContainer = getEl('progress-container');
const progressBar = getEl('progress-bar');
const progressLabel = getEl('progress-label');
const encryptBtn = getEl('encrypt-btn');
const decryptBtn = getEl('decrypt-btn');
const outputContainer = getEl('output-container');
const outputText = getEl('output-text');
const outputImage = getEl('output-image');
const copyBtn = getEl('copy-btn');
const togglePasswordBtn = getEl('toggle-password');
const toast = getEl('toast');
const integrityBadge = getEl('integrity-badge');

const DEFAULT_KEY = "CRYPTON_DEFAULT_KEY_2024";

// Sound Effects
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
let successBuffer, errorBuffer;

let currentImageData = null;
let rawOriginalImage = null;
let lastFullResult = ""; // Stores the complete raw string for copying

/**
 * Compresses an image to ensure it fits within reasonable encryption limits
 * while preserving visibility.
 */
async function compressImage(dataUrl, maxWidth = 1200, maxHeight = 1200, quality = 0.4) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width *= maxHeight / height;
                    height = maxHeight;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            // Use smoothing
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);
            
            // Output as JPEG for significantly better compression than PNG
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => reject(new Error('Image loading failed'));
        img.src = dataUrl;
    });
}

async function loadSounds() {
    const loadSound = async (url) => {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        return await audioContext.decodeAudioData(arrayBuffer);
    };

    try {
        successBuffer = await loadSound('success.mp3');
        errorBuffer = await loadSound('error.mp3');
    } catch (e) {
        console.warn('Audio could not be loaded', e);
    }
}

function playSound(buffer) {
    if (!buffer) return;
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start(0);
}

// UI Helpers
function showToast(message, type = 'info') {
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.remove('hidden');
    
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

function updateOutput(content) {
    outputContainer.classList.remove('hidden');
    outputImage.classList.add('hidden');
    outputText.textContent = "";
    
    // Store the full content in our persistent variable for the copy button
    lastFullResult = content;

    // Check if content is a JSON string (for image + text)
    try {
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === 'object' && (parsed.t || parsed.i)) {
            if (parsed.i) {
                outputImage.src = parsed.i;
                outputImage.classList.remove('hidden');
            }
            // For UI display, we show only the text part if it's a JSON payload
            outputText.textContent = parsed.t || "";
            
            // If it's a message result, we might prefer to copy just the message
            // But if there's no message and it's just an image, we should ensure copying works
            if (!parsed.t && parsed.i) {
                outputText.textContent = "[Decrypted Image]";
            }
            return;
        }
    } catch (e) {
        // Not JSON, treat as raw text
    }
    
    // Display raw content (usually encrypted base64)
    outputText.textContent = content;
    
    // Ensure we scroll the output container into view
    outputContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function setProgress(percent, label) {
    progressContainer.classList.remove('hidden');
    progressBar.style.width = `${percent}%`;
    if (label) progressLabel.textContent = label;
}

function hideProgress() {
    progressContainer.classList.add('hidden');
    progressBar.style.width = '0%';
}

/**
 * Simulates a progress bar for an async operation
 */
async function withProgress(label, task) {
    setProgress(10, label);
    const interval = setInterval(() => {
        const currentWidth = parseFloat(progressBar.style.width);
        if (currentWidth < 90) {
            setProgress(currentWidth + Math.random() * 15, label);
        }
    }, 200);

    try {
        const result = await task();
        setProgress(100, "Complete");
        setTimeout(hideProgress, 500);
        return result;
    } catch (err) {
        hideProgress();
        throw err;
    } finally {
        clearInterval(interval);
    }
}

/**
 * Runs a self-test by encrypting and then decrypting the image data.
 */
async function runIntegrityTest(imageData) {
    if (!imageData) return;
    
    const useDefault = useDefaultCheckbox ? useDefaultCheckbox.checked : false;
    const password = useDefault ? DEFAULT_KEY : (passwordInput ? passwordInput.value : '');
    
    // We can only test if we have a password
    if (!password) {
        integrityBadge.className = 'integrity-badge';
        integrityBadge.querySelector('.label').textContent = 'Waiting for key...';
        return;
    }

    integrityBadge.className = 'integrity-badge verifying';
    integrityBadge.querySelector('.label').textContent = 'Verifying...';
    imagePreviewContainer.classList.remove('test-passed', 'test-failed');

    try {
        const payload = JSON.stringify({ t: "TEST_INTEGRITY", i: imageData });
        const encrypted = await encrypt(payload, password);
        const decrypted = await decrypt(encrypted, password);
        
        const parsed = JSON.parse(decrypted);
        if (parsed.i === imageData) {
            integrityBadge.className = 'integrity-badge success';
            integrityBadge.querySelector('.label').textContent = 'Integrity OK';
            imagePreviewContainer.classList.add('test-passed');
        } else {
            throw new Error('Data mismatch');
        }
    } catch (err) {
        console.error('Integrity test failed:', err);
        integrityBadge.className = 'integrity-badge error';
        integrityBadge.querySelector('.label').textContent = 'Test Failed';
        imagePreviewContainer.classList.add('test-failed');
        showToast('Auto-test failed: Data might be too large or key is invalid', 'error');
        playSound(errorBuffer);
    }
}

// Image Handling
imageInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        showToast('Processing image...', 'info');
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                rawOriginalImage = event.target.result;
                const quality = parseInt(qualitySlider.value) / 1000;
                
                currentImageData = await compressImage(rawOriginalImage, 1200, 1200, quality);
                imagePreview.src = currentImageData;
                imagePreviewContainer.classList.remove('hidden');
                qualitySettings.classList.remove('hidden');
                imagePreviewContainer.classList.remove('test-passed', 'test-failed');
                
                showToast('Image ready!', 'success');
                
                await runIntegrityTest(currentImageData);
            } catch (err) {
                console.error('Image processing error:', err);
                showToast('Failed to process image', 'error');
                playSound(errorBuffer);
            }
        };
        reader.readAsDataURL(file);
    }
});

qualitySlider.addEventListener('input', async () => {
    const val = qualitySlider.value;
    qualityValue.textContent = `${(val / 10).toFixed(1)}%`;
});

qualitySlider.addEventListener('change', async () => {
    if (rawOriginalImage) {
        try {
            const quality = parseInt(qualitySlider.value) / 1000;
            showToast('Re-compressing...', 'info');
            currentImageData = await compressImage(rawOriginalImage, 1200, 1200, quality);
            imagePreview.src = currentImageData;
            await runIntegrityTest(currentImageData);
        } catch (err) {
            showToast('Compression failed', 'error');
        }
    }
});

removeImageBtn.addEventListener('click', () => {
    currentImageData = null;
    rawOriginalImage = null;
    imageInput.value = '';
    imagePreviewContainer.classList.add('hidden');
    qualitySettings.classList.add('hidden');
    imagePreview.src = '';
});

// Event Listeners
if (useDefaultCheckbox && passwordInput) {
    useDefaultCheckbox.addEventListener('change', () => {
        passwordInput.disabled = useDefaultCheckbox.checked;
        if (useDefaultCheckbox.checked) {
            passwordInput.value = '••••••••••••';
        } else {
            passwordInput.value = '';
        }
        // Re-run integrity test when key changes
        if (currentImageData) {
            runIntegrityTest(currentImageData);
        }
    });

    passwordInput.addEventListener('input', () => {
        if (currentImageData) {
            // Use a slight debounce for manual typing to avoid freezing
            clearTimeout(passwordInput.testTimeout);
            passwordInput.testTimeout = setTimeout(() => {
                runIntegrityTest(currentImageData);
            }, 500);
        }
    });
}

if (encryptBtn) {
    encryptBtn.addEventListener('click', async () => {
        const useDefault = useDefaultCheckbox ? useDefaultCheckbox.checked : false;
        const password = useDefault ? DEFAULT_KEY : (passwordInput ? passwordInput.value : '');
        const text = textInput ? textInput.value : '';

        if (encryptBtn.disabled) return;
        if (!useDefault && !password) {
            showToast('Please enter a secret key', 'error');
            playSound(errorBuffer);
            return;
        }
        if (!text && !currentImageData) {
            showToast('Enter text or add an image', 'error');
            playSound(errorBuffer);
            return;
        }

        try {
            encryptBtn.disabled = true;
            encryptBtn.textContent = 'Encrypting...';
            
            // Package text and image into a single string for encryption
            let payload = text;
            if (currentImageData) {
                payload = JSON.stringify({ t: text, i: currentImageData });
            }

            const result = await withProgress('Encrypting Data...', () => encrypt(payload, password));
            
            // Store the full raw result for reliable copying
            lastFullResult = result;
            
            // Update UI
            outputText.textContent = result;
            
            if (result.length > 300000) {
                showToast('Large result generated. Use the copy button.', 'info');
            } else {
                showToast('Encrypted successfully!', 'success');
            }
            
            outputImage.classList.add('hidden');
            outputContainer.classList.remove('hidden');
            outputContainer.scrollIntoView({ behavior: 'smooth' });
            
            // Reset input state (optional, keep it so user can see what they encrypted)
            // currentImageData = null;
            // imageInput.value = '';
            // imagePreviewContainer.classList.add('hidden');
            // qualitySettings.classList.add('hidden');
            // textInput.value = '';
            
            playSound(successBuffer);
        } catch (err) {
            console.error(err);
            showToast('Encryption failed', 'error');
            playSound(errorBuffer);
        } finally {
            encryptBtn.disabled = false;
            encryptBtn.textContent = 'Encrypt';
        }
    });
}

if (decryptBtn) {
    decryptBtn.addEventListener('click', async () => {
        const useDefault = useDefaultCheckbox ? useDefaultCheckbox.checked : false;
        const password = useDefault ? DEFAULT_KEY : (passwordInput ? passwordInput.value : '');
        const encryptedText = textInput ? textInput.value.trim() : '';

        if (decryptBtn.disabled) return;
        if (!useDefault && !password) {
            showToast('Please enter a secret key', 'error');
            playSound(errorBuffer);
            return;
        }
        if (!encryptedText) {
            showToast('Paste the encrypted text', 'error');
            playSound(errorBuffer);
            return;
        }

        try {
            decryptBtn.disabled = true;
            decryptBtn.textContent = 'Decrypting...';
            
            const result = await withProgress('Decrypting Data...', () => decrypt(encryptedText, password));
            updateOutput(result);
            
            showToast('Decrypted successfully!', 'success');
            playSound(successBuffer);
        } catch (err) {
            console.error('Decryption error:', err);
            showToast('Invalid key or corrupted data', 'error');
            playSound(errorBuffer);
        } finally {
            decryptBtn.disabled = false;
            decryptBtn.textContent = 'Decrypt';
        }
    });
}

if (copyBtn) {
    copyBtn.addEventListener('click', () => {
        // Use the persistent variable first to ensure no truncation by the DOM
        const textToCopy = lastFullResult || outputText.textContent;
        
        if (textToCopy) {
            // Use modern clipboard API which handles large strings better
            navigator.clipboard.writeText(textToCopy).then(() => {
                showToast('Full result copied!', 'success');
                playSound(successBuffer);
            }).catch((err) => {
                console.error('Clipboard error:', err);
                showToast('Failed to copy. Data may be too large for clipboard.', 'error');
                playSound(errorBuffer);
            });
        } else {
            showToast('Nothing to copy', 'error');
        }
    });
}

if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener('click', () => {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        togglePasswordBtn.style.color = type === 'text' ? 'var(--primary)' : 'var(--text-muted)';
    });
}

// Initialize
loadSounds();