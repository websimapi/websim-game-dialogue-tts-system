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
    // Split into words
    let words = text.split(/\s+/);
    
    // Check for speaker name (first word if all caps)
    let speakerName = null;
    if (words.length > 0 && words[0].match(/^[A-Z]+$/)) {
      speakerName = words[0];
      words = words.slice(1); // Remove speaker name
    }
    
    // Clean remaining text
    let cleanedText = words
      .map(word => {
        // Convert to lowercase
        word = word.toLowerCase();
        // Remove special characters, keeping only alphanumeric and basic punctuation
        word = word.replace(/[^a-z0-9.,!?'-]/g, '');
        return word;
      })
      // Filter out single letters except 'a' and 'i'
      .filter(word => word.length > 1 || word === 'a' || word === 'i')
      .join(' ')
      .trim();

    return {
      text: cleanedText,
      speakerName: speakerName
    };
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
      return { text: '', speakerName: null };
    }
  }
}