export class OCRProcessor {
  constructor() {
    this.worker = Tesseract.createWorker();
    this.initialized = false;
    this.npcNames = new Set(this.loadNPCNames());
    
    // Parameters for triangle detection
    this.triangleColor = {r: 0, g: 0, b: 0}; // Black triangle
    this.triangleColorTolerance = 30;
    this.minTriangleSize = 10; // Minimum pixel size to consider
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

    // Mask out triangles before OCR
    this.maskTriangles(canvas, ctx);

    try {
      const { data: { text } } = await this.worker.recognize(canvas);
      return this.cleanText(text);
    } catch (error) {
      console.error('OCR error:', error);
      return { name: null, text: '' };
    }
  }

  maskTriangles(canvas, ctx) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const width = canvas.width;
    const height = canvas.height;
    const visited = new Set();

    // Scan for dark triangular shapes
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const key = `${x},${y}`;

        if (visited.has(key)) continue;

        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        // Check if pixel matches triangle color
        if (this.isColorMatch(r, g, b, this.triangleColor, this.triangleColorTolerance)) {
          const region = this.floodFillTriangle(imageData, x, y, visited);
          
          // If region forms a rough triangle shape, mask it
          if (region && this.isTriangularShape(region)) {
            ctx.fillStyle = '#ffffff'; // Fill with white to mask
            ctx.fillRect(region.minX, region.minY, 
                        region.maxX - region.minX, 
                        region.maxY - region.minY);
          }
        }
      }
    }
  }

  isColorMatch(r, g, b, targetColor, tolerance) {
    return Math.abs(r - targetColor.r) <= tolerance &&
           Math.abs(g - targetColor.g) <= tolerance &&
           Math.abs(b - targetColor.b) <= tolerance;
  }

  floodFillTriangle(imageData, startX, startY, visited) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const points = [];
    const stack = [[startX, startY]];
    
    let minX = startX, maxX = startX;
    let minY = startY, maxY = startY;

    while (stack.length > 0) {
      const [x, y] = stack.pop();
      const key = `${x},${y}`;
      
      if (visited.has(key)) continue;
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      
      const idx = (y * width + x) * 4;
      if (!this.isColorMatch(
        data[idx], 
        data[idx + 1], 
        data[idx + 2], 
        this.triangleColor, 
        this.triangleColorTolerance
      )) continue;

      visited.add(key);
      points.push([x, y]);
      
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);

      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }

    if (points.length < this.minTriangleSize) return null;

    return {
      points,
      minX,
      maxX,
      minY,
      maxY
    };
  }

  isTriangularShape(region) {
    // Calculate aspect ratio of bounding box
    const width = region.maxX - region.minX;
    const height = region.maxY - region.minY;
    const aspectRatio = width / height;

    // Calculate density of points in the region
    const area = width * height;
    const density = region.points.length / area;

    // Triangles typically have:
    // 1. Aspect ratio close to 1 (roughly equilateral)
    // 2. Point density around 0.5 (half the bounding box filled)
    // 3. More points at the top than bottom
    
    let topCount = 0;
    let bottomCount = 0;
    const midY = (region.minY + region.maxY) / 2;

    region.points.forEach(([_, y]) => {
      if (y < midY) topCount++;
      else bottomCount++;
    });

    return (
      aspectRatio > 0.5 && aspectRatio < 2.0 && // Not too stretched
      density > 0.3 && density < 0.7 && // Reasonable density
      bottomCount > topCount // More points at bottom (pointing down)
    );
  }
}