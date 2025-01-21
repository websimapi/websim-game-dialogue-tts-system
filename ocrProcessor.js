export class OCRProcessor {
  constructor() {
    this.worker = Tesseract.createWorker();
    this.initialized = false;
    this.npcNames = new Set(this.loadNPCNames());
  }

  loadNPCNames() {
    const savedNames = localStorage.getItem('npcNames');
    return savedNames ? JSON.parse(savedNames) : [];
  }

  saveNPCNames() {
    localStorage.setItem('npcNames', JSON.stringify(Array.from(this.npcNames)));
  }

  extractNPCName(text) {
    // Remove leading special characters and get the first word
    const firstWord = text.replace(/^[^a-zA-Z0-9]*/, '').split(/[\s.:]/)[0];
    
    // Check if the word is fully capitalized (at least 2 characters)
    if (firstWord && firstWord.length >= 2 && firstWord === firstWord.toUpperCase()) {
      this.npcNames.add(firstWord);
      this.saveNPCNames();
      // Remove the NPC name and any following special characters
      text = text.substring(text.indexOf(firstWord) + firstWord.length)
        .replace(/^[^a-zA-Z0-9]*/, '');
      return { name: firstWord, text };
    }
    
    return { name: null, text };
  }

  cleanText(text) {
    // Extract NPC name first if present
    const { name, text: remainingText } = this.extractNPCName(text);
    
    // Clean the remaining text
    let cleanedText = remainingText.toLowerCase();
    // Remove special characters, keeping only alphanumeric, spaces, and basic punctuation
    cleanedText = cleanedText.replace(/[^a-z0-9\s.,!?'-]/g, '');
    // Clean up multiple spaces
    cleanedText = cleanedText.replace(/\s+/g, ' ').trim();
    
    return { name, text: cleanedText };
  }

  async init() {
    if (!this.initialized) {
      await this.worker.load();
      await this.worker.loadLanguage('eng');
      await this.worker.initialize('eng');
      this.initialized = true;
    }
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
      return { name: null, text: '' };
    }
  }
}