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
  }

  setupEventListeners() {
    document.getElementById('startCapture').addEventListener('click', () => this.startCapture());
    
    // Setup color picker events
    for (let i = 1; i <= 3; i++) {
      document.getElementById(`color${i}`).addEventListener('input', (e) => {
        this.dialogueDetector.setColor(i-1, e.target.value);
      });
      
      document.getElementById(`tolerance${i}`).addEventListener('input', (e) => {
        this.dialogueDetector.setTolerance(i-1, parseInt(e.target.value));
        e.target.nextElementSibling.textContent = e.target.value;
      });
    }

    // Scan interval slider
    document.getElementById('scanInterval').addEventListener('input', (e) => {
      e.target.nextElementSibling.textContent = e.target.value;
      this.updateScanInterval(parseInt(e.target.value));
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
          const text = await this.ocrProcessor.processRegion(video, region);
          
          if (text && text !== this.lastDialogue) {
            this.lastDialogue = text;
            dialoguePreview.style.backgroundImage = `url(${region.preview})`;
            ocrText.textContent = text;
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