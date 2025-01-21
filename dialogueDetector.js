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

  async detectDialogueRegions(video, debugCanvas) {
    // Ensure canvas dimensions match video dimensions
    if (debugCanvas.width !== video.videoWidth || debugCanvas.height !== video.videoHeight) {
      debugCanvas.width = video.videoWidth;
      debugCanvas.height = video.videoHeight;
    }

    const ctx = debugCanvas.getContext('2d', { alpha: false });
    
    // Clear previous frame
    ctx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);
    
    // Draw current frame
    ctx.drawImage(video, 0, 0);
    
    const imageData = ctx.getImageData(0, 0, debugCanvas.width, debugCanvas.height);
    
    const enabledColors = this.colors
      .map((color, index) => ({ color, index }))
      .filter((item, index) => this.enabled[index] && item.color !== '#ffffff');

    if (enabledColors.length === 0) return [];

    const regionPromises = enabledColors.map(async ({ color, index }) => {
      const regions = await this.findColorRegions(imageData, this.hexToRgb(color), this.tolerances[index]);
      return regions.map(region => ({
        ...region,
        boxIndex: index,
        preview: this.createRegionPreview(video, region)
      }));
    });

    const regionsArrays = await Promise.all(regionPromises);
    const regions = regionsArrays.flat();

    // Draw debug visualization
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    regions.forEach(region => {
      ctx.strokeRect(region.x, region.y, region.width, region.height);
    });

    return regions;
  }

  findColorRegions(imageData, targetColor, tolerance) {
    return new Promise((resolve) => {
      // Create more efficient region detection by sampling fewer pixels
      const scanStep = 4; // Check every 4th pixel
      const minRegionSize = 2000; // Minimum region size in pixels
      const regions = [];
      const width = imageData.width;
      const height = imageData.height;
      const visited = new Set();

      // Use TypedArrays for better performance
      const data = new Uint8ClampedArray(imageData.data.buffer);

      for (let y = 0; y < height; y += scanStep) {
        for (let x = 0; x < width; x += scanStep) {
          const index = (y * width + x) * 4;
          const key = `${x},${y}`;
          
          if (visited.has(key)) continue;

          const r = data[index];
          const g = data[index + 1];
          const b = data[index + 2];

          if (Math.abs(r - targetColor.r) <= tolerance &&
              Math.abs(g - targetColor.g) <= tolerance &&
              Math.abs(b - targetColor.b) <= tolerance) {
            
            // More efficient flood fill
            const region = this.floodFillOptimized(imageData, x, y, targetColor, tolerance, visited, scanStep);
            if (region.width * region.height > minRegionSize) {
              regions.push(region);
            }
          }
        }
      }

      resolve(regions);
    });
  }

  floodFillOptimized(imageData, startX, startY, targetColor, tolerance, visited, scanStep) {
    const width = imageData.width;
    const height = imageData.height;
    const data = new Uint8ClampedArray(imageData.data.buffer);
    
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
      
      if (!(Math.abs(r - targetColor.r) <= tolerance &&
          Math.abs(g - targetColor.g) <= tolerance &&
          Math.abs(b - targetColor.b) <= tolerance)) continue;
      
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      
      // Step by scanStep when adding new points to check
      for (let dx = -scanStep; dx <= scanStep; dx += scanStep) {
        for (let dy = -scanStep; dy <= scanStep; dy += scanStep) {
          const newX = x + dx;
          const newY = y + dy;
          if (newX >= 0 && newX < width && newY >= 0 && newY < height) {
            stack.push([newX, newY]);
          }
        }
      }
    }
    
    return {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1
    };
  }

  createRegionPreview(video, region) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Ensure canvas size matches region size
    canvas.width = region.width;
    canvas.height = region.height;
    
    try {
      // Draw the region to the canvas
      ctx.drawImage(
        video,
        region.x, region.y, region.width, region.height,  // Source rectangle
        0, 0, region.width, region.height                 // Destination rectangle
      );
      
      // Convert to data URL
      return canvas.toDataURL('image/jpeg', 0.8);  // Use JPEG with 0.8 quality for better performance
    } catch (error) {
      console.error('Error creating region preview:', error);
      return null;
    }
  }

  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }
}