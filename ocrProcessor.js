export class OCRProcessor {
  constructor() {
    this.worker = Tesseract.createWorker();
    this.initialized = false;
  }

  async init() {
    if (!this.initialized) {
      await this.worker.load();
      await this.worker.loadLanguage('eng');
      await this.worker.initialize('eng');
      this.initialized = true;
    }
  }

  cleanText(text) {
    // Convert to lowercase
    text = text.toLowerCase();
    // Remove special characters, keeping only alphanumeric, spaces, and basic punctuation
    text = text.replace(/[^a-z0-9\s.,!?'-]/g, '');
    // Clean up multiple spaces
    text = text.replace(/\s+/g, ' ').trim();
    return text;
  }

  async processRegion(video, region) {
    await this.init();

    const canvas = document.createElement('canvas');
    canvas.width = region.width;
    canvas.height = region.height;
    const ctx = canvas.getContext('2d');
    
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

    try {
      const { data: { text } } = await this.worker.recognize(canvas);
      return this.cleanText(text);
    } catch (error) {
      console.error('OCR error:', error);
      return '';
    }
  }
}