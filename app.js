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
    this.isProcessing = false;
    this.lastDialogue = '';
    this.scanInterval = null;
    this.isPickingColor = false;
  }

  setupEventListeners() {
    document.getElementById('startCapture').addEventListener('click', () => this.startCapture());
    
    // Setup color picker events
    for (let i = 1; i <= 3; i++) {
      const colorInput = document.getElementById(`color${i}`);
      colorInput.addEventListener('input', (e) => {
        this.dialogueDetector.setColor(i-1, e.target.value);
      });
      
      document.getElementById(`tolerance${i}`).addEventListener('input', (e) => {
        this.dialogueDetector.setTolerance(i-1, parseInt(e.target.value));
        e.target.nextElementSibling.textContent = e.target.value;
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
          const { text, speakerName } = await this.ocrProcessor.processRegion(video, region);
          
          if (text && text !== this.lastDialogue) {
            this.lastDialogue = text;
            dialoguePreview.style.backgroundImage = `url(${region.preview})`;
            
            // Display speaker name if present
            const displayText = speakerName ? `${speakerName}: ${text}` : text;
            ocrText.textContent = displayText;
            
            // Speak the text with the appropriate voice
            await this.ttsEngine.speak(text, speakerName);
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