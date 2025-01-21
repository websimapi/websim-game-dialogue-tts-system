export class DialogueDetector {
  constructor() {
    this.colors = Array(3).fill('#ffffff');
    this.tolerances = Array(3).fill(10);
  }

  setColor(index, color) {
    this.colors[index] = color;
  }

  setTolerance(index, tolerance) {
    this.tolerances[index] = tolerance;
  }

  detectDialogueRegions(video, debugCanvas) {
    debugCanvas.width = video.videoWidth;
    debugCanvas.height = video.videoHeight;
    const ctx = debugCanvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    
    const regions = [];
    const imageData = ctx.getImageData(0, 0, debugCanvas.width, debugCanvas.height);
    
    for (let i = 0; i < this.colors.length; i++) {
      if (this.colors[i] === '#ffffff') continue;
      
      const colorRegions = this.findColorRegions(
        imageData, 
        this.hexToRgb(this.colors[i]),
        this.tolerances[i]
      );
      
      regions.push(...colorRegions);
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

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
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
    
    // Create preview image
    const canvas = document.createElement('canvas');
    canvas.width = region.width;
    canvas.height = region.height;
    const ctx = canvas.getContext('2d');
    ctx.putImageData(
      imageData, 
      -region.x, 
      -region.y, 
      region.x, 
      region.y, 
      region.width, 
      region.height
    );
    region.preview = canvas.toDataURL();
    
    return region;
  }
}