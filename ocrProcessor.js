export class OCRProcessor {
  constructor() {
    this.worker = Tesseract.createWorker();
    this.initialized = false;
    this.npcNames = new Set(this.loadNPCNames());
    this.dictionary = null;
    this.loadDictionary();
  }

  async loadDictionary() {
    try {
      const response = await fetch('/simple_english_dictionary.json');
      this.dictionary = new Set(await response.json());
    } catch (error) {
      console.error('Error loading dictionary:', error);
      this.dictionary = new Set(); // Fallback to empty set
    }
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

  validateWords(text) {
    if (!this.dictionary) return text; // If dictionary not loaded, return original text

    return text.split(/\s+/)
      .filter(word => {
        // Always keep basic words 'a' and 'i'
        if (word === 'a' || word === 'i') return true;

        // Remove punctuation for dictionary lookup
        const cleanWord = word.replace(/[.,!?']/g, '').toLowerCase();
        
        // Keep word if it's in the dictionary
        return this.dictionary.has(cleanWord);
      })
      .join(' ');
  }

  cleanText(text) {
    // Extract NPC name first if present
    const { name, text: remainingText } = this.extractNPCName(text);
    
    // Clean the remaining text
    let cleanedText = remainingText.toLowerCase();
    
    // Remove special characters, keeping only alphanumeric, spaces, and basic punctuation
    cleanedText = cleanedText.replace(/[^a-z0-9\s.,!?']/g, '');
    
    // Replace multiple spaces with single space
    cleanedText = cleanedText.replace(/\s+/g, ' ');
    
    // Handle single letters - split into words
    cleanedText = cleanedText.split(/\s+/)
      .filter(word => {
        // Keep words longer than 1 character
        if (word.length > 1) return true;
        // Keep 'a' and 'i'
        if (word === 'a' || word === 'i') return true;
        // Remove all other single characters
        return false;
      })
      .join(' ')
      .trim();
    
    // Validate words against dictionary
    cleanedText = this.validateWords(cleanedText);
    
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
    if (!region) return { name: null, text: '' };
    
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
      console.log('Processing OCR for region:', region);
      const { data: { text } } = await this.worker.recognize(canvas);
      console.log('Raw OCR text:', text);
      const cleaned = this.cleanText(text);
      console.log('Cleaned OCR text:', cleaned);
      return cleaned;
    } catch (error) {
      console.error('OCR error:', error);
      return { name: null, text: '' };
    }
  }
}