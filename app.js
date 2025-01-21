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
    
    this.setupEventListeners();
    this.populateVoiceSelects();
    this.loadSavedSettings();
    this.isProcessing = false;
    this.lastDialogue = { name: null, text: '' };
    this.scanInterval = null;
    this.isPickingColor = false;
    this.setupNPCList();
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
      
      if (regions.length > 0) {
        const dialoguePreview = document.getElementById('dialoguePreview');
        const ocrText = document.getElementById('ocrText');
        
        for (const region of regions) {
          const { name, text } = await this.ocrProcessor.processRegion(video, region);
          
          if (text && (text !== this.lastDialogue.text || name !== this.lastDialogue.name)) {
            this.lastDialogue = { name, text };
            dialoguePreview.style.backgroundImage = `url(${region.preview})`;
            
            ocrText.textContent = name ? `${name}: ${text}` : text;
            
            if (name) {
              this.addNPCToList(name);
            }

            // Get voice preference for this NPC or dialogue box
            let selectedVoice;
            if (name) {
              const voiceSelect = document.querySelector(`[data-npc="${name}"] .voice-select`);
              if (voiceSelect && voiceSelect.value) {
                selectedVoice = speechSynthesis.getVoices()
                  .find(voice => voice.name === voiceSelect.value);
              }
            }
            
            // If no NPC voice, use dialogue box default voice
            if (!selectedVoice && region.boxIndex !== undefined) {
              const boxVoice = document.getElementById(`voice${region.boxIndex + 1}`).value;
              if (boxVoice) {
                selectedVoice = speechSynthesis.getVoices()
                  .find(voice => voice.name === boxVoice);
              }
            }

            if (selectedVoice) {
              this.ttsEngine.setVoice(selectedVoice);
            }

            await this.ttsEngine.speak(text);
          }
        }
      }
    } catch (error) {
      console.error('Error processing frame:', error);
    }

    this.isProcessing = false;
  }
}

const app = new GameDialogueTTS();