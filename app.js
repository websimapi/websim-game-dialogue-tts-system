import { DialogueDetector } from './dialogueDetector.js';
import { VideoCapture } from './videoCapture.js';
import { OCRProcessor } from './ocrProcessor.js';
import { TTSEngine } from './ttsEngine.js';

class GameDialogueTTS {
  constructor() {
    this.videoCapture = new VideoCapture();
    this.dialogueDetector = new DialogueDetector();
    this.ocrProcessor = new OCRProcessor();
    this.ttsEngine = new TTSEngine();
    
    this.manualRegions = [];
    this.loadManualRegions();
    this.isSelectingRegion = false;
    this.selectionStart = null;
    
    this.setupEventListeners();
    this.populateVoiceSelects();
    this.loadSavedSettings();
    this.imageAnalysisWorker = new Worker('imageAnalysisWorker.js');
    this.dialogueWorker = new Worker('dialogueWorker.js');
    
    this.setupWorkerHandlers();
    
    this.processingQueue = [];
    this.isProcessing = false;
    
    this.processFrameLoop();
  }

  populateVoiceSelects() {
    const populateSelect = (select) => {
      select.innerHTML = `
        <option value="">Default Voice</option>
        ${speechSynthesis.getVoices().map(voice => 
          `<option value="${voice.name}">${voice.name} (${voice.lang})</option>`
        ).join('')}
      `;
    };

    const voiceSelects = document.querySelectorAll('.voice-select');
    voiceSelects.forEach(select => populateSelect(select));

    // Handle dynamic voice loading
    speechSynthesis.onvoiceschanged = () => {
      voiceSelects.forEach(select => populateSelect(select));
      this.loadSavedSettings();
    };
  }

  loadSavedSettings() {
    // Load color picker settings
    for (let i = 1; i <= 3; i++) {
      const colorInput = document.getElementById(`color${i}`);
      const toleranceInput = document.getElementById(`tolerance${i}`);
      const enableInput = document.getElementById(`enable${i}`);
      const voiceSelect = document.getElementById(`voice${i}`);

      const savedColor = localStorage.getItem(`dialogueColor${i-1}`);
      const savedTolerance = localStorage.getItem(`dialogueTolerance${i-1}`);
      const savedEnabled = localStorage.getItem(`dialogueEnabled${i-1}`);
      const savedVoice = localStorage.getItem(`dialogueVoice${i-1}`);

      if (savedColor) colorInput.value = savedColor;
      if (savedTolerance) {
        toleranceInput.value = savedTolerance;
        toleranceInput.nextElementSibling.textContent = savedTolerance;
      }
      if (savedEnabled !== null) enableInput.checked = savedEnabled === 'true';
      if (savedVoice) voiceSelect.value = savedVoice;
    }
  }

  setupEventListeners() {
    document.getElementById('startCapture').addEventListener('click', () => this.startCapture());
    
    // Setup color picker events
    for (let i = 1; i <= 3; i++) {
      const colorInput = document.getElementById(`color${i}`);
      const enableInput = document.getElementById(`enable${i}`);
      const voiceSelect = document.getElementById(`voice${i}`);

      colorInput.addEventListener('input', (e) => {
        this.dialogueDetector.setColor(i-1, e.target.value);
      });
      
      document.getElementById(`tolerance${i}`).addEventListener('input', (e) => {
        this.dialogueDetector.setTolerance(i-1, parseInt(e.target.value));
        e.target.nextElementSibling.textContent = e.target.value;
      });

      enableInput.addEventListener('change', (e) => {
        this.dialogueDetector.setEnabled(i-1, e.target.checked);
      });

      voiceSelect.addEventListener('change', (e) => {
        localStorage.setItem(`dialogueVoice${i-1}`, e.target.value);
      });
    }

    // Setup color pick from screen buttons
    document.querySelectorAll('.pick-button').forEach(button => {
      button.addEventListener('click', (e) => {
        const pickerIndex = parseInt(e.target.dataset.picker) - 1;
        this.startColorPick(pickerIndex);
      });
    });

    // Setup color pick overlay
    const overlay = document.querySelector('.color-pick-overlay');
    overlay.addEventListener('click', (e) => {
      if (this.isPickingColor) {
        this.pickColor(e);
      }
    });

    // Scan interval slider
    document.getElementById('scanInterval').addEventListener('input', (e) => {
      e.target.nextElementSibling.textContent = e.target.value;
      this.updateScanInterval(parseInt(e.target.value));
    });

    document.getElementById('addRegion').addEventListener('click', () => {
      this.startRegionSelection();
    });

    // Setup region selection overlay
    const regionOverlay = document.querySelector('.region-select-overlay');
    regionOverlay.addEventListener('mousedown', (e) => {
      if (this.isSelectingRegion) {
        this.startSelection(e);
      }
    });

    regionOverlay.addEventListener('mousemove', (e) => {
      if (this.isSelectingRegion && this.selectionStart) {
        this.updateSelection(e);
      }
    });

    regionOverlay.addEventListener('mouseup', (e) => {
      if (this.isSelectingRegion) {
        this.finalizeSelection(e);
      }
    });
  }

  setupWorkerHandlers() {
    this.imageAnalysisWorker.onmessage = (e) => {
      const { type, result, error } = e.data;
      if (error) {
        console.error('Worker error:', error);
        return;
      }
      
      if (type === 'imageChangeResult') {
        this.handleImageChangeResult(result);
      }
    };

    this.dialogueWorker.onmessage = (e) => {
      const { type, result, error } = e.data;
      if (error) {
        console.error('Dialogue worker error:', error);
        return;
      }
      
      if (type === 'ocrResult') {
        this.handleOCRResult(result);
      }
    };

    // Add error handlers for workers
    this.imageAnalysisWorker.onerror = (error) => {
      console.error('Image analysis worker error:', error);
    };

    this.dialogueWorker.onerror = (error) => {
      console.error('Dialogue worker error:', error);
    };
  }

  processFrameLoop() {
    if (!this.isProcessing && this.processingQueue.length > 0) {
      const task = this.processingQueue.shift();
      this.executeTask(task);
    }
    
    requestAnimationFrame(() => this.processFrameLoop());
  }

  async executeTask(task) {
    this.isProcessing = true;
    
    try {
      switch (task.type) {
        case 'processFrame':
          await this.doProcessFrame();
          break;
        case 'processManualRegion':
          await this.doProcessManualRegion(task.region);
          break;
      }
    } catch (error) {
      console.error('Task execution error:', error);
    }
    
    this.isProcessing = false;
  }

  async processFrame() {
    if (this.processingQueue.length < 3) { // Limit queue size
      this.processingQueue.push({ type: 'processFrame' });
    }
  }

  async doProcessFrame() {
    const video = document.getElementById('gameVideo');
    const debugCanvas = document.getElementById('debugCanvas');
    
    // Use OffscreenCanvas for better performance
    const offscreen = new OffscreenCanvas(video.videoWidth, video.videoHeight);
    const ctx = offscreen.getContext('2d');
    ctx.drawImage(video, 0, 0);
    
    // Process regions in parallel
    const regions = this.dialogueDetector.detectDialogueRegions(video, debugCanvas);
    
    await Promise.all(regions.map(region => 
      this.processRegion(offscreen, region)
    ));
  }

  async processRegion(canvas, region) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(
      region.x,
      region.y,
      region.width,
      region.height
    );
    
    this.dialogueWorker.postMessage({
      type: 'processRegion',
      data: { imageData, region }
    });
  }

  async startCapture() {
    const stream = await this.videoCapture.startCapture();
    const video = document.getElementById('gameVideo');
    video.srcObject = stream;
    
    this.startScanning();
  }

  startScanning() {
    const interval = parseInt(document.getElementById('scanInterval').value);
    this.scanInterval = setInterval(() => this.processFrame(), interval);
  }

  updateScanInterval(newInterval) {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = setInterval(() => this.processFrame(), newInterval);
    }
  }

  handleImageChangeResult(result) {
    // Handle image change result from worker
  }

  handleOCRResult(result) {
    // Handle OCR result from worker
  }

  startRegionSelection() {
    this.isSelectingRegion = true;
    document.querySelector('.region-select-overlay').classList.add('active');
  }

  startSelection(event) {
    const video = document.getElementById('gameVideo');
    const rect = video.getBoundingClientRect();
    
    if (event.clientX >= rect.left && event.clientX <= rect.right &&
        event.clientY >= rect.top && event.clientY <= rect.bottom) {
      this.selectionStart = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
      
      const box = document.createElement('div');
      box.classList.add('selection-box');
      box.style.left = `${this.selectionStart.x}px`;
      box.style.top = `${this.selectionStart.y}px`;
      document.querySelector('.region-select-overlay').appendChild(box);
    }
  }

  updateSelection(event) {
    const video = document.getElementById('gameVideo');
    const rect = video.getBoundingClientRect();
    const box = document.querySelector('.selection-box');
    
    if (box) {
      const currentX = Math.min(Math.max(event.clientX - rect.left, 0), video.offsetWidth);
      const currentY = Math.min(Math.max(event.clientY - rect.top, 0), video.offsetHeight);
      
      const width = Math.abs(currentX - this.selectionStart.x);
      const height = Math.abs(currentY - this.selectionStart.y);
      const left = Math.min(currentX, this.selectionStart.x);
      const top = Math.min(currentY, this.selectionStart.y);
      
      box.style.width = `${width}px`;
      box.style.height = `${height}px`;
      box.style.left = `${left}px`;
      box.style.top = `${top}px`;
    }
  }

  finalizeSelection(event) {
    const video = document.getElementById('gameVideo');
    const rect = video.getBoundingClientRect();
    const box = document.querySelector('.selection-box');
    
    if (box) {
      const region = {
        id: Date.now(),
        x: parseInt(box.style.left) * (video.videoWidth / video.offsetWidth),
        y: parseInt(box.style.top) * (video.videoHeight / video.offsetHeight),
        width: parseInt(box.style.width) * (video.videoWidth / video.offsetWidth),
        height: parseInt(box.style.height) * (video.videoHeight / video.offsetHeight),
        threshold: 0.1,
        lastImage: null,
        lastText: ''
      };
      
      this.manualRegions.push(region);
      this.saveManualRegions();
      this.addRegionToList(region);
      
      box.remove();
    }
    
    this.isSelectingRegion = false;
    document.querySelector('.region-select-overlay').classList.remove('active');
    this.selectionStart = null;
  }

  loadManualRegions() {
    const saved = localStorage.getItem('manualRegions');
    if (saved) {
      this.manualRegions = JSON.parse(saved);
      this.manualRegions.forEach(region => this.addRegionToList(region));
    }
  }

  saveManualRegions() {
    localStorage.setItem('manualRegions', JSON.stringify(this.manualRegions));
  }

  addRegionToList(region) {
    const list = document.getElementById('manualRegionsList');
    const div = document.createElement('div');
    div.classList.add('manual-region-item');
    div.dataset.regionId = region.id;
    
    div.innerHTML = `
      <div class="manual-region-controls">
        <div class="region-threshold">
          <label>Change Threshold:</label>
          <input type="range" class="threshold-slider" min="1" max="100" value="${region.threshold * 100}">
          <span class="threshold-value">${region.threshold * 100}%</span>
        </div>
        <div class="region-preview"></div>
        <div class="region-debug"></div>
        <button class="remove-region">Remove Region</button>
      </div>
    `;
    
    div.querySelector('.threshold-slider').addEventListener('input', (e) => {
      const threshold = parseInt(e.target.value) / 100;
      region.threshold = threshold;
      e.target.nextElementSibling.textContent = `${e.target.value}%`;
      this.saveManualRegions();
    });
    
    div.querySelector('.remove-region').addEventListener('click', () => {
      this.manualRegions = this.manualRegions.filter(r => r.id !== region.id);
      this.saveManualRegions();
      div.remove();
    });
    
    list.appendChild(div);
  }

  startColorPick(pickerIndex) {
    this.isPickingColor = true;
    this.currentPickerIndex = pickerIndex;
    document.querySelector('.color-pick-overlay').classList.add('active');
  }

  pickColor(event) {
    const video = document.getElementById('gameVideo');
    const rect = video.getBoundingClientRect();
    
    // Check if click is within video bounds
    if (event.clientX >= rect.left && event.clientX <= rect.right &&
        event.clientY >= rect.top && event.clientY <= rect.bottom) {
      
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      
      // Create temporary canvas to sample color
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);
      
      // Get color at click position
      const scaleX = video.videoWidth / video.offsetWidth;
      const scaleY = video.videoHeight / video.offsetHeight;
      const pixel = ctx.getImageData(x * scaleX, y * scaleY, 1, 1).data;
      
      // Convert to hex
      const color = '#' + [pixel[0], pixel[1], pixel[2]]
        .map(x => x.toString(16).padStart(2, '0'))
        .join('');
      
      // Update color picker and detector
      const colorInput = document.getElementById(`color${this.currentPickerIndex + 1}`);
      colorInput.value = color;
      this.dialogueDetector.setColor(this.currentPickerIndex, color);
    }
    
    // Reset picking state
    this.isPickingColor = false;
    document.querySelector('.color-pick-overlay').classList.remove('active');
  }

  setupNPCList() {
    const npcNames = this.ocrProcessor.loadNPCNames();
    const npcList = document.getElementById('npcList');
    npcNames.forEach(name => {
      this.addNPCToList(name);
    });
  }

  addNPCToList(name) {
    const npcList = document.getElementById('npcList');
    if (!document.querySelector(`[data-npc="${name}"]`)) {
      const div = document.createElement('div');
      div.classList.add('npc-item');
      div.dataset.npc = name;
      div.innerHTML = `
        <span>${name}</span>
        <select class="voice-select">
          <option value="">Default Voice</option>
          ${speechSynthesis.getVoices().map(voice => 
            `<option value="${voice.name}">${voice.name} (${voice.lang})</option>`
          ).join('')}
        </select>
      `;
      npcList.appendChild(div);

      // Load saved voice preference
      const savedVoice = localStorage.getItem(`npc-voice-${name}`);
      if (savedVoice) {
        div.querySelector('.voice-select').value = savedVoice;
      }

      // Save voice preference on change
      div.querySelector('.voice-select').addEventListener('change', (e) => {
        localStorage.setItem(`npc-voice-${name}`, e.target.value);
      });
    }
  }

  async doProcessManualRegion(region) {
    const canvas = document.createElement('canvas');
    canvas.width = region.width;
    canvas.height = region.height;
    const ctx = canvas.getContext('2d');
    
    const video = document.getElementById('gameVideo');
    ctx.drawImage(
      video,
      region.x,
      region.y,
      region.width,
      region.height,
      0,
      0,
      region.width,
      region.height
    );
    
    const imageData = canvas.toDataURL();
    
    if (!region.lastImage || await this.detectImageChange(region.lastImage, imageData, region.threshold)) {
      region.lastImage = imageData;
      
      const { text } = await this.ocrProcessor.processRegion(video, region);
      if (text !== region.lastText) {
        region.lastText = text;
        
        const regionElement = document.querySelector(`[data-region-id="${region.id}"]`);
        if (regionElement) {
          regionElement.querySelector('.region-preview').style.backgroundImage = `url(${imageData})`;
          regionElement.querySelector('.region-debug').textContent = text;
        }
      }
    }
  }

  detectImageChange(oldImage, newImage, threshold) {
    return new Promise((resolve) => {
      this.imageAnalysisWorker.postMessage({
        type: 'detectImageChange',
        data: { oldImage, newImage, threshold }
      });
      this.imageAnalysisWorker.onmessage = (e) => {
        const { type, result } = e.data;
        if (type === 'imageChangeResult') {
          resolve(result);
        }
      };
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new GameDialogueTTS();
});