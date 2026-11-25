/**
 * scanner.js - Mobile Camera Viewfinder, OCR Execution, Lens Mapping, and 27-Field Form
 */

import { ocrAgent } from './ocr.js';
import { GoogleLensMapper } from './text-mapping.js';
import { db, EXCEL_COLUMNS_27, COLUMN_KEY_MAP } from './supabase.js';

export class ScannerController {
  constructor() {
    this.stream = null;
    this.facingMode = 'environment'; // Back camera by default on phones
    this.isTorchOn = false;
    this.capturedBlob = null;
    this.capturedDataUrl = null;
    this.currentOcrResult = null;
    this.lensMapper = null;
    this.editingBookId = null;

    this.videoElement = document.getElementById('cameraVideo');
    this.canvasElement = document.getElementById('scannerCanvas');
    this.previewImage = document.getElementById('capturedImagePreview');
    this.lensContainer = document.getElementById('lensContainer');
    this.lensOverlay = document.getElementById('lensOverlay');
    this.lensPopover = document.getElementById('lensPopover');
    this.ocrProgressOverlay = document.getElementById('ocrProgressOverlay');
    this.ocrProgressBar = document.getElementById('ocrProgressBar');
    this.ocrProgressText = document.getElementById('ocrProgressText');
    this.extractedTextOutput = document.getElementById('extractedTextOutput');
    this.wordChipsContainer = document.getElementById('extractedChipsContainer');

    this.initLens();
    this.initEvents();
  }

  initLens() {
    if (this.lensContainer && this.previewImage && this.lensOverlay && this.lensPopover) {
      this.lensMapper = new GoogleLensMapper(
        this.lensContainer,
        this.previewImage,
        this.lensOverlay,
        this.lensPopover
      );

      this.lensMapper.onFieldAssignedCallback = (columnName, text) => {
        this.setFieldValue(columnName, text);
        window.app.showToast(`Assigned to "${columnName}"`, 'success');
      };
    }
  }

  initEvents() {
    // Shutter button
    const shutterBtn = document.getElementById('shutterBtn');
    if (shutterBtn) {
      shutterBtn.addEventListener('click', () => this.captureImage());
    }

    // Switch Camera Button (Front / Back)
    const switchCamBtn = document.getElementById('switchCamBtn');
    if (switchCamBtn) {
      switchCamBtn.addEventListener('click', () => this.switchCamera());
    }

    // Torch / Flash Toggle Button
    const torchBtn = document.getElementById('torchBtn');
    if (torchBtn) {
      torchBtn.addEventListener('click', () => this.toggleTorch());
    }

    // Image Upload fallback
    const imageUploadInput = document.getElementById('imageUploadInput');
    if (imageUploadInput) {
      imageUploadInput.addEventListener('change', (e) => this.handleImageUpload(e));
    }

    // Re-scan button
    const rescanBtn = document.getElementById('rescanBtn');
    if (rescanBtn) {
      rescanBtn.addEventListener('click', () => this.resetScanner());
    }

    // Auto-detect & Map Button
    const autoMapBtn = document.getElementById('autoMapBtn');
    if (autoMapBtn) {
      autoMapBtn.addEventListener('click', () => this.runAutoMapping());
    }

    // Recognition Model Selector
    const modelSelector = document.getElementById('ocrModelSelector');
    if (modelSelector) {
      modelSelector.addEventListener('change', (e) => {
        const modelName = e.target.options[e.target.selectedIndex].text;
        window.app.showToast(`Recognition Model: ${modelName}`, 'info');
        if (this.currentOcrResult && this.currentOcrResult.text) {
          this.runAutoMapping();
        }
      });
    }

    // Save Book Form Submission
    const bookForm = document.getElementById('bookDetailsForm');
    if (bookForm) {
      bookForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveCurrentBook(false);
      });
    }

    // Save & Scan Next
    const saveAndNextBtn = document.getElementById('saveAndNextBtn');
    if (saveAndNextBtn) {
      saveAndNextBtn.addEventListener('click', () => {
        this.saveCurrentBook(true);
      });
    }

    // Clear Form
    const clearFormBtn = document.getElementById('clearFormBtn');
    if (clearFormBtn) {
      clearFormBtn.addEventListener('click', () => this.clearForm());
    }

    // Copy Extracted Text
    const copyOcrTextBtn = document.getElementById('copyOcrTextBtn');
    if (copyOcrTextBtn) {
      copyOcrTextBtn.addEventListener('click', () => {
        if (this.extractedTextOutput && this.extractedTextOutput.textContent) {
          navigator.clipboard.writeText(this.extractedTextOutput.textContent);
          window.app.showToast('Raw text copied to clipboard', 'info');
        }
      });
    }

    // Form Section Tabs
    const formTabs = document.querySelectorAll('.form-tab-btn');
    formTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        formTabs.forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.form-tab-pane').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const targetPane = document.getElementById(tab.dataset.target);
        if (targetPane) targetPane.classList.add('active');
      });
    });
  }

  async startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      window.app.showToast('Camera API is not supported in this browser environment. Please use image upload.', 'warning');
      return;
    }

    try {
      this.stopCamera();

      const constraints = {
        video: {
          facingMode: { ideal: this.facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (this.videoElement) {
        this.videoElement.srcObject = this.stream;
        await this.videoElement.play();
      }

      document.getElementById('cameraViewSection').style.display = 'block';
      document.getElementById('capturedViewSection').style.display = 'none';
    } catch (err) {
      console.warn('Camera access error:', err);
      window.app.showToast('Could not start camera. Check permissions or upload an image file.', 'warning');
    }
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
  }

  async switchCamera() {
    this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
    await this.startCamera();
    window.app.showToast(`Switched to ${this.facingMode === 'environment' ? 'Rear' : 'Front'} Camera`, 'info');
  }

  async toggleTorch() {
    if (!this.stream) return;
    const track = this.stream.getVideoTracks()[0];
    if (!track) return;

    const capabilities = track.getCapabilities ? track.getCapabilities() : {};
    if (!capabilities.torch) {
      window.app.showToast('Torch/Flashlight is not available on this device camera', 'info');
      return;
    }

    try {
      this.isTorchOn = !this.isTorchOn;
      await track.applyConstraints({
        advanced: [{ torch: this.isTorchOn }]
      });
      window.app.showToast(`Torch turned ${this.isTorchOn ? 'ON' : 'OFF'}`, 'info');
    } catch (e) {
      console.warn('Failed to toggle torch:', e);
    }
  }

  captureImage() {
    if (!this.videoElement || !this.canvasElement) return;

    // Play tactile vibration & shutter sound effect
    try {
      if (navigator.vibrate) navigator.vibrate(60);
      window.app.playShutterSound();
    } catch (e) {}

    const video = this.videoElement;
    const canvas = this.canvasElement;
    canvas.width = video.videoWidth || video.clientWidth || 1280;
    canvas.height = video.videoHeight || video.clientHeight || 720;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Stop video stream after capture to conserve battery
    this.stopCamera();

    // If camera was in fullscreen mode, exit fullscreen smoothly
    if (typeof window.toggleCameraFullscreen === 'function') {
      window.toggleCameraFullscreen(false);
    }

    // Export image immediately so UI responds instantaneously
    try {
      this.capturedDataUrl = canvas.toDataURL('image/jpeg', 0.92);
      canvas.toBlob((blob) => {
        this.capturedBlob = blob;
      }, 'image/jpeg', 0.92);
      this.processCapturedImage(this.capturedDataUrl, canvas.width, canvas.height);
    } catch (err) {
      console.error('Error generating image from canvas:', err);
      window.app.showToast('Could not process camera image. Please try again.', 'error');
    }
  }

  handleImageUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      this.capturedBlob = file;
      this.capturedDataUrl = dataUrl;

      const img = new Image();
      img.onload = () => {
        this.processCapturedImage(dataUrl, img.width, img.height);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  async processCapturedImage(dataUrl, width, height) {
    document.getElementById('cameraViewSection').style.display = 'none';
    document.getElementById('capturedViewSection').style.display = 'block';

    if (this.previewImage) {
      this.previewImage.src = dataUrl;
    }

    // Run Tesseract OCR
    this.showOcrProgress(true);

    try {
      const result = await ocrAgent.recognize(dataUrl, (progress, status) => {
        this.updateOcrProgress(progress, status);
      });

      this.currentOcrResult = result;
      this.renderOcrTextAndChips(result);

      // Render Google Lens interactive overlay once preview image renders
      setTimeout(() => {
        if (this.lensMapper) {
          this.lensMapper.renderTokens(result, width, height);
        }
      }, 300);

      // Automatically execute auto-mapping heuristics into the form
      this.runAutoMapping();

      window.app.showToast('Book page text extracted successfully!', 'success');
    } catch (err) {
      console.error('OCR processing error:', err);
      window.app.showToast('Text recognition failed. Please try again with clear lighting.', 'error');
    } finally {
      this.showOcrProgress(false);
    }
  }

  renderOcrTextAndChips(ocrResult) {
    if (this.extractedTextOutput) {
      this.extractedTextOutput.textContent = ocrResult.text || 'No text detected.';
    }

    if (this.wordChipsContainer) {
      this.wordChipsContainer.innerHTML = '';
      const words = (ocrResult.words || []).slice(0, 45); // first 45 tokens

      words.forEach(w => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'text-token-chip';
        chip.textContent = w.text;
        chip.title = 'Click to assign text';

        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.lensMapper) {
            this.lensMapper.selectedWords = [w.text];
            this.lensMapper.showPopover(w.text, chip);
          }
        });

        this.wordChipsContainer.appendChild(chip);
      });
    }
  }

  runAutoMapping() {
    if (!this.currentOcrResult || !this.currentOcrResult.text) {
      window.app.showToast('No extracted text available to map.', 'warning');
      return;
    }

    const detected = GoogleLensMapper.autoMapText(this.currentOcrResult.text);
    let mappedCount = 0;

    Object.entries(detected).forEach(([columnName, value]) => {
      if (value) {
        this.setFieldValue(columnName, value);
        mappedCount++;
      }
    });

    // Auto-generate Access No if not set
    const accessNoField = document.getElementById('field_access_no');
    if (accessNoField && !accessNoField.value) {
      accessNoField.value = `ACC-${Math.floor(10000 + Math.random() * 90000)}`;
    }

    window.app.showToast(`Auto-mapped ${mappedCount} fields from scanned text`, 'success');
  }

  setFieldValue(columnName, value) {
    const propKey = COLUMN_KEY_MAP[columnName];
    if (!propKey) return;

    const input = document.getElementById(`field_${propKey}`);
    if (input) {
      input.value = value;

      // Automatically switch to the tab containing this field so user sees the change!
      const targetPane = input.closest('.form-tab-pane');
      if (targetPane) {
        const paneId = targetPane.id;
        document.querySelectorAll('.form-tab-btn').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.target === paneId);
        });
        document.querySelectorAll('.form-tab-pane').forEach(pane => {
          pane.classList.toggle('active', pane.id === paneId);
        });
      }

      // Smoothly focus or scroll to input
      try {
        input.focus({ preventScroll: true });
      } catch (e) {}

      // Visual feedback highlight
      input.style.backgroundColor = '#ecfdf5';
      input.style.borderColor = '#10b981';
      input.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.2)';
      setTimeout(() => {
        input.style.backgroundColor = '';
        input.style.borderColor = '';
        input.style.boxShadow = '';
      }, 1500);
    }
  }

  showOcrProgress(show) {
    if (this.ocrProgressOverlay) {
      if (show) {
        this.ocrProgressOverlay.classList.add('active');
        this.updateOcrProgress(0, 'Initializing OCR engine...');
      } else {
        this.ocrProgressOverlay.classList.remove('active');
      }
    }
  }

  updateOcrProgress(percentage, text) {
    if (this.ocrProgressBar) {
      this.ocrProgressBar.style.width = `${percentage}%`;
    }
    if (this.ocrProgressText) {
      this.ocrProgressText.textContent = text || `${percentage}%`;
    }
  }

  resetScanner() {
    document.getElementById('capturedViewSection').style.display = 'none';
    document.getElementById('cameraViewSection').style.display = 'block';
    if (this.lensOverlay) this.lensOverlay.innerHTML = '';
    if (this.lensMapper) this.lensMapper.hidePopover();
    this.capturedBlob = null;
    this.capturedDataUrl = null;
    this.currentOcrResult = null;
    this.startCamera();
  }

  clearForm() {
    const form = document.getElementById('bookDetailsForm');
    if (form) form.reset();
    this.editingBookId = null;
    const editingBadge = document.getElementById('editingIndicator');
    if (editingBadge) editingBadge.style.display = 'none';
  }

  loadBookIntoForm(book) {
    this.clearForm();
    this.editingBookId = book.id;

    EXCEL_COLUMNS_27.forEach(col => {
      const propKey = COLUMN_KEY_MAP[col];
      const input = document.getElementById(`field_${propKey}`);
      if (input && book[propKey] !== undefined && book[propKey] !== null) {
        input.value = book[propKey];
      }
    });

    const editingBadge = document.getElementById('editingIndicator');
    if (editingBadge) {
      editingBadge.style.display = 'inline-block';
      editingBadge.textContent = `Editing: ${book.access_no || book.title}`;
    }
  }

  async saveCurrentBook(scanNext = false) {
    const titleInput = document.getElementById('field_title');
    if (!titleInput || !titleInput.value.trim()) {
      window.app.showToast('Book Title is required before saving.', 'warning');
      titleInput.focus();
      return;
    }

    const bookData = {
      id: this.editingBookId || undefined,
      scanned_image_url: this.capturedDataUrl || undefined,
      ocr_raw_text: this.currentOcrResult ? this.currentOcrResult.text : '',
      source: this.editingBookId ? 'manual' : 'scanned',
      verification_status: 'verified'
    };

    // Gather all 27 fields
    EXCEL_COLUMNS_27.forEach(col => {
      const propKey = COLUMN_KEY_MAP[col];
      const input = document.getElementById(`field_${propKey}`);
      if (input) {
        bookData[propKey] = input.value.trim();
      }
    });

    // If image was captured and Supabase is configured, upload image
    if (this.capturedBlob && db.isConfigured) {
      try {
        const publicUrl = await db.uploadScanImage(this.capturedBlob, `scan_${bookData.access_no || Date.now()}.jpg`);
        if (publicUrl) {
          bookData.scanned_image_url = publicUrl;
        }
      } catch (e) {
        console.warn('Image upload skipped:', e);
      }
    }

    try {
      await db.saveBook(bookData);
      window.app.showToast('Book record saved successfully!', 'success');
      window.app.refreshDashboard();

      if (scanNext) {
        this.clearForm();
        this.resetScanner();
      } else {
        window.app.navigate('books');
      }
    } catch (err) {
      console.error('Failed to save book:', err);
      window.app.showToast('Error saving book record.', 'error');
    }
  }
}
