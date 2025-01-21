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
    const ctx = debugCanvas.getContext('2d', { alpha: false });
    debugCanvas.width = video.videoWidth;
    debugCanvas.height = video.videoHeight;
    
    ctx.drawImage(video, 0, 0);
    
    const imageData = ctx.getImageData(0, 0, debugCanvas.width, debugCanvas.height);
    
    const enabledColors = this.colors
      .map((color, index) => ({ color, index }))
      .filter((item, index) => this.enabled[index] && item.color !== '#ffffff');

    const regionPromises = enabledColors.map(({ color, index }) => 
      this.findColorRegions(imageData, this.hexToRgb(color), this.tolerances[index])
        .then(regions => regions.map(region => {
          // Create a temporary canvas for the region preview
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = region.width;
          tempCanvas.height = region.height;
          const tempCtx = tempCanvas.getContext('2d');
          tempCtx.drawImage(video, region.x, region.y, region.width, region.height, 
                           0, 0, region.width, region.height);
          region.preview = tempCanvas.toDataURL();
          return {...region, boxIndex: index};
        }))
    );

    const regionsArrays = await Promise.all(regionPromises);
    const regions = regionsArrays.flat();

    // Visualization
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    ctx.beginPath();
    regions.forEach(region => {
      ctx.rect(region.x, region.y, region.width, region.height);
    });
    ctx.stroke();

    return regions;
  }

  findColorRegions(imageData, targetColor, tolerance) {
    return new Promise((resolve) => {
      const worker = new Worker(URL.createObjectURL(new Blob([`
        onmessage = function(e) {
          const { imageData, targetColor, tolerance } = e.data;
          const width = imageData.width;
          const height = imageData.height;
          const data = imageData.data;
          const visited = new Set();
          const regions = [];

          for (let y = 0; y < height; y += 2) {
            for (let x = 0; x < width; x += 2) {
              const index = (y * width + x) * 4;
              const key = \`${x},${y}\`;
              
              if (visited.has(key)) continue;
              
              const r = data[index];
              const g = data[index + 1];
              const b = data[index + 2];

              if (Math.abs(r - targetColor.r) <= tolerance &&
                  Math.abs(g - targetColor.g) <= tolerance &&
                  Math.abs(b - targetColor.b) <= tolerance) {
                const region = floodFill(imageData, x, y, targetColor, tolerance, visited);
                if (region.width * region.height > 1000) {
                  regions.push(region);
                }
              }
            }
          }

          postMessage(regions);
        }

        function floodFill(imageData, startX, startY, targetColor, tolerance, visited) {
          const width = imageData.width;
          const height = imageData.height;
          const data = imageData.data;
          
          let minX = startX, maxX = startX;
          let minY = startY, maxY = startY;
          
          const stack = [[startX, startY]];
          
          while (stack.length > 0) {
            const [x, y] = stack.pop();
            const key = \`${x},${y}\`;
            
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
          
          return region;
        }
      `], { type: 'text/javascript' })));

      worker.onmessage = (e) => {
        const regions = e.data;
        worker.terminate();
        resolve(regions);
      };

      worker.postMessage({ imageData, targetColor, tolerance });
    });
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