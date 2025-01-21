export class DialogueDetector {
  constructor() {
    this.colors = Array(3).fill('#ffffff');
    this.tolerances = Array(3).fill(10);
    this.enabled = Array(3).fill(true);
    this.loadSettings();
  }

  loadSettings() {
    for (let i = 0; i < 3; i++) {
      const savedColor = localStorage.getItem(`dialogueColor${i}`);
      const savedTolerance = localStorage.getItem(`dialogueTolerance${i}`);
      const savedEnabled = localStorage.getItem(`dialogueEnabled${i}`);
      
      if (savedColor) this.colors[i] = savedColor;
      if (savedTolerance) this.tolerances[i] = parseInt(savedTolerance);
      if (savedEnabled) this.enabled[i] = savedEnabled === 'true';
    }
  }

  saveSettings() {
    for (let i = 0; i < 3; i++) {
      localStorage.setItem(`dialogueColor${i}`, this.colors[i]);
      localStorage.setItem(`dialogueTolerance${i}`, this.tolerances[i]);
      localStorage.setItem(`dialogueEnabled${i}`, this.enabled[i]);
    }
  }

  setColor(index, color) {
    this.colors[index] = color;
    this.saveSettings();
  }

  setTolerance(index, tolerance) {
    this.tolerances[index] = tolerance;
    this.saveSettings();
  }

  setEnabled(index, enabled) {
    this.enabled[index] = enabled;
    this.saveSettings();
  }

  detectDialogueRegions(video, debugCanvas) {
    debugCanvas.width = video.videoWidth;
    debugCanvas.height = video.videoHeight;
    const ctx = debugCanvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    
    const regions = [];
    const imageData = ctx.getImageData(0, 0, debugCanvas.width, debugCanvas.height);
    
    // Process enabled colors in parallel
    const enabledColors = this.colors
      .map((color, index) => ({ color, index }))
      .filter((item, index) => this.enabled[index] && item.color !== '#ffffff');

    for (const { color, index } of enabledColors) {
      const colorRegions = this.findColorRegions(
        imageData, 
        this.hexToRgb(color),
        this.tolerances[index]
      );
      
      regions.push(...colorRegions.map(region => ({...region, boxIndex: index})));
    }

    // Draw debug rectangles
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    regions.forEach(region => {
      ctx.strokeRect(region.x, region.y, region.width, region.height);
    });

    return regions;
  }

  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  findColorRegions(imageData, targetColor, tolerance) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    const visited = new Set();
    const regions = [];

    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const index = (y * width + x) * 4;
        const key = `${x},${y}`;
        
        if (visited.has(key)) continue;
        
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];

        if (this.isColorMatch(r, g, b, targetColor, tolerance)) {
          const region = this.floodFill(imageData, x, y, targetColor, tolerance, visited);
          if (region.width * region.height > 1000) { // Min size threshold
            regions.push(region);
          }
        }
      }
    }

    return regions;
  }

  isColorMatch(r, g, b, targetColor, tolerance) {
    return Math.abs(r - targetColor.r) <= tolerance &&
           Math.abs(g - targetColor.g) <= tolerance &&
           Math.abs(b - targetColor.b) <= tolerance;
  }

  floodFill(imageData, startX, startY, targetColor, tolerance, visited) {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;
    
    let minX = startX, maxX = startX;
    let minY = startY, maxY = startY;
    
    const stack = [[startX, startY]];
    
    while (stack.length > 0) {
      const [x, y] = stack.pop();
      const key = `${x},${y}`;
      
      if (visited.has(key)) continue;
      visited.add(key);
      
      const index = (y * width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      
      if (!this.isColorMatch(r, g, b, targetColor, tolerance)) continue;
      
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      
      // Add neighbors
      if (x > 0) stack.push([x - 1, y]);
      if (x < width - 1) stack.push([x + 1, y]);
      if (y > 0) stack.push([x, y - 1]);
      if (y < height - 1) stack.push([x, y + 1]);
    }
    
    const region = {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1
    };
    
    // Create a new ImageData for the cropped region
    const croppedData = new ImageData(region.width, region.height);
    
    // Copy pixel data from original to cropped
    for (let y = 0; y < region.height; y++) {
      for (let x = 0; x < region.width; x++) {
        const sourceIndex = ((y + region.y) * width + (x + region.x)) * 4;
        const targetIndex = (y * region.width + x) * 4;
        
        croppedData.data[targetIndex] = data[sourceIndex];
        croppedData.data[targetIndex + 1] = data[sourceIndex + 1];
        croppedData.data[targetIndex + 2] = data[sourceIndex + 2];
        croppedData.data[targetIndex + 3] = data[sourceIndex + 3];
      }
    }
    
    // Create preview image
    const canvas = document.createElement('canvas');
    canvas.width = region.width;
    canvas.height = region.height;
    const ctx = canvas.getContext('2d');
    ctx.putImageData(croppedData, 0, 0);
    region.preview = canvas.toDataURL();
    
    return region;
  }
}