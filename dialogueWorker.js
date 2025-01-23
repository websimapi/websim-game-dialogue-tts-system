importScripts('https://cdn.jsdelivr.net/npm/tesseract.js@4.1.1/dist/tesseract.min.js');

let worker = null;
let initialized = false;
let initializationPromise = null;

async function initializeWorker() {
  if (initialized) return;
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    try {
      worker = await Tesseract.createWorker();
      await worker.load();
      await worker.loadLanguage('eng');
      await worker.initialize('eng');
      initialized = true;
    } catch (error) {
      console.error('Failed to initialize Tesseract worker:', error);
      // Retry initialization after a delay
      setTimeout(() => {
        initializationPromise = null;
        initialized = false;
      }, 5000);
      throw error;
    }
  })();

  return initializationPromise;
}

self.onmessage = async function(e) {
  const { type, data } = e.data;

  try {
    await initializeWorker();

    switch (type) {
      case 'processRegion': {
        const { imageData, region } = data;
        const result = await processRegion(imageData, region);
        self.postMessage({ type: 'ocrResult', result });
        break;
      }
    }
  } catch (error) {
    self.postMessage({ 
      type: 'error', 
      error: {
        message: error.message,
        stack: error.stack
      }
    });
  }
};

async function processRegion(imageData, region) {
  try {
    const { data: { text } } = await worker.recognize(imageData);
    return cleanText(text);
  } catch (error) {
    console.error('OCR error:', error);
    return { name: null, text: '' };
  }
}

function cleanText(text) {
  // Extract NPC name first if present
  const { name, text: remainingText } = extractNPCName(text);
  
  // Clean the remaining text
  let cleanedText = remainingText.toLowerCase();
  
  // Remove special characters, keeping only alphanumeric, spaces, and basic punctuation
  cleanedText = cleanedText.replace(/[^a-z0-9\s.,!?']/g, '');
  
  // Replace multiple spaces with single space
  cleanedText = cleanedText.replace(/\s+/g, ' ');
  
  // Handle single letters - split into words
  cleanedText = cleanedText.split(/\s+/)
    .filter(word => {
      if (word.length > 1) return true;
      if (word === 'a' || word === 'i') return true;
      return false;
    })
    .join(' ')
    .trim();
  
  return { name, text: cleanedText };
}

function extractNPCName(text) {
  // Remove leading special characters and get the first word
  const firstWord = text.replace(/^[^a-zA-Z0-9]*/, '').split(/[\s.:]/)[0];
  
  // Check if the word is fully capitalized (at least 2 characters)
  if (firstWord && firstWord.length >= 2 && firstWord === firstWord.toUpperCase()) {
    // Remove the NPC name and any following special characters
    text = text.substring(text.indexOf(firstWord) + firstWord.length)
      .replace(/^[^a-zA-Z0-9]*/, '');
    return { name: firstWord, text };
  }
  
  return { name: null, text };
}