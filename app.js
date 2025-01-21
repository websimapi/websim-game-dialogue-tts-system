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
    
    this.isProcessing = false;
    this.lastDialogue = { name: null, text: '' };
    this.scanInterval = null;
    this.isPickingColor = false;
    this.defaultVoices = Array(3).fill(null);
    this.enabledDetectors = Array(3).fill(true);
    
    this.init();
  }

  async init() {
    await this.loadSettings();
    this.setupEventListeners();
    this.setupNPCList();
  }

  async loadSettings() {
    // Load colors
    for (let i = 0; i < 3; i++) {
      const color = localStorage.getItem(`detector${i+1}-color`);
      if (color) {
        document.getElementById(`color${i+1}`).value = color;
        this.dialogueDetector.setColor(i, color);
      }

      // Load tolerances
      const tolerance = localStorage.getItem(`detector${i+1}-tolerance`);
      if (tolerance !== null) {
        const toleranceValue = parseInt(tolerance);
        document.getElementById(`tolerance${i+1}`).value = toleranceValue;
        document.getElementById(`tolerance${i+1}`).nextElementSibling.textContent = toleranceValue;
        this.dialogueDetector.setTolerance(i, toleranceValue);
      }

      // Load enabled states
      const enabled = localStorage.getItem(`detector${i+1}-enabled`);
      if (enabled !== null) {
        this.enabledDetectors[i] = enabled === 'true';
        document.getElementById(`enabled${i+1}`).checked = this.enabledDetectors[i];
      }
    }

    // Load scan interval
    const interval = localStorage.getItem('scanInterval');
    if (interval) {
      const intervalValue = parseInt(interval);
      document.getElementById('scanInterval').value = intervalValue;
      document.getElementById('scanInterval').nextElementSibling.textContent = intervalValue;
    }

    // Load voice settings after voices are available
    await new Promise(resolve => {
      if (speechSynthesis.getVoices().length) {
        resolve();
      } else {
        speechSynthesis.onvoiceschanged = resolve;
      }
    });

    for (let i = 0; i < 3; i++) {
      const defaultVoice = localStorage.getItem(`detector${i+1}-voice`);
      if (defaultVoice) {
        this.defaultVoices[i] = speechSynthesis.getVoices().find(v => v.name === defaultVoice);
        document.getElementById(`defaultVoice${i+1}`).value = defaultVoice;
      }
    }
  }

  setupEventListeners() {
    document.getElementById('startCapture').addEventListener('click', () => this.startCapture());
    
    // Setup color picker events
    for (let i = 1; i <= 3; i++) {
      const colorInput = document.getElementById(`color${i}`);
      colorInput.addEventListener('input', (e) => {
        this.dialogueDetector.setColor(i-1, e.target.value);
        localStorage.setItem(`detector${i}-color`, e.target.value);
      });
      
      document.getElementById(`tolerance${i}`).addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        this.dialogueDetector.setTolerance(i-1, value);
        e.target.nextElementSibling.textContent = value;
        localStorage.setItem(`detector${i}-tolerance`, value);
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
      const value = e.target.value;
      e.target.nextElementSibling.textContent = value;
      this.updateScanInterval(parseInt(value));
      localStorage.setItem('scanInterval', value);
    });

    // Setup voice selects
    const setupVoiceSelects = () => {
      const voices = speechSynthesis.getVoices();
      document.querySelectorAll('.default-voice').forEach(select => {
        select.innerHTML = `
          <option value="">System Default</option>
          ${voices.map(voice => 
            `<option value="${voice.name}">${voice.name} (${voice.lang})</option>`
          ).join('')}
        `;
      });
    };

    speechSynthesis.onvoiceschanged = setupVoiceSelects;
    setupVoiceSelects();

    // Setup default voice and enabled toggles
    for (let i = 1; i <= 3; i++) {
      document.getElementById(`enabled${i}`).addEventListener('change', (e) => {
        this.enabledDetectors[i-1] = e.target.checked;
        localStorage.setItem(`detector${i}-enabled`, e.target.checked);
      });

      document.getElementById(`defaultVoice${i}`).addEventListener('change', (e) => {
        const voice = speechSynthesis.getVoices().find(v => v.name === e.target.value);
        this.defaultVoices[i-1] = voice;
        localStorage.setItem(`detector${i}-voice`, e.target.value);
      });
    }
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
        <div class="npc-header">
          <span>${name}</span>
          <button class="delete-npc">Delete</button>
        </div>
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

      // Delete NPC handler
      div.querySelector('.delete-npc').addEventListener('click', () => {
        localStorage.removeItem(`npc-voice-${name}`);
        this.ocrProcessor.npcNames.delete(name);
        this.ocrProcessor.saveNPCNames();
        div.remove();
      });
    }
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

  async processFrame() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    const video = document.getElementById('gameVideo');
    const debugCanvas = document.getElementById('debugCanvas');
    
    try {
      const regions = this.dialogueDetector.detectDialogueRegions(video, debugCanvas);
      
      for (let i = 0; i < regions.length; i++) {
        if (!this.enabledDetectors[i]) continue;
        
        const region = regions[i];
        const result = await this.ocrProcessor.processRegion(video, region);
        
        if (result.text && (result.text !== this.lastDialogue.text || result.name !== this.lastDialogue.name)) {
          this.updateDialogueUI(region, result);
          await this.handleTTS(result, i);
          this.lastDialogue = result;
        }
      }
    } catch (error) {
      console.error('Error processing frame:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  updateDialogueUI(region, result) {
    const dialoguePreview = document.getElementById('dialoguePreview');
    const ocrText = document.getElementById('ocrText');
    
    dialoguePreview.style.backgroundImage = `url(${region.preview})`;
    ocrText.textContent = result.name ? `${result.name}: ${result.text}` : result.text;
    
    if (result.name) {
      this.addNPCToList(result.name);
    }
  }

  async handleTTS(result, detectorIndex) {
    let selectedVoice = null;
    
    if (result.name) {
      const voiceSelect = document.querySelector(`[data-npc="${result.name}"] .voice-select`);
      if (voiceSelect?.value) {
        selectedVoice = speechSynthesis.getVoices()
          .find(voice => voice.name === voiceSelect.value);
      }
    }
    
    if (!selectedVoice && this.defaultVoices[detectorIndex]) {
      selectedVoice = this.defaultVoices[detectorIndex];
    }

    if (selectedVoice) {
      this.ttsEngine.setVoice(selectedVoice);
    }

    await this.ttsEngine.speak(result.text);
  }
}

const app = new GameDialogueTTS();