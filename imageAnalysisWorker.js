self.onmessage = async function(e) {
  const { type, data } = e.data;

  switch (type) {
    case 'detectImageChange': {
      const { oldImage, newImage, threshold } = data;
      const result = await detectImageChange(oldImage, newImage, threshold);
      self.postMessage({ type: 'imageChangeResult', result });
      break;
    }
  }
};

async function detectImageChange(oldImage, newImage, threshold) {
  if (!oldImage) return true;
  
  const canvas1 = new OffscreenCanvas(256, 256);
  const canvas2 = new OffscreenCanvas(256, 256);
  
  const ctx1 = canvas1.getContext('2d');
  const ctx2 = canvas2.getContext('2d');
  
  const [img1, img2] = await Promise.all([
    createImageBitmap(dataURItoBlob(oldImage)),
    createImageBitmap(dataURItoBlob(newImage))
  ]);
  
  canvas1.width = img1.width;
  canvas1.height = img1.height;
  canvas2.width = img2.width;
  canvas2.height = img2.height;
  
  ctx1.drawImage(img1, 0, 0);
  ctx2.drawImage(img2, 0, 0);
  
  const data1 = ctx1.getImageData(0, 0, canvas1.width, canvas1.height).data;
  const data2 = ctx2.getImageData(0, 0, canvas2.width, canvas2.height).data;
  
  let diffCount = 0;
  const step = 4; // Sample every 4th pixel for better performance
  
  for (let i = 0; i < data1.length; i += 4 * step) {
    if (Math.abs(data1[i] - data2[i]) > 10 ||
        Math.abs(data1[i + 1] - data2[i + 1]) > 10 ||
        Math.abs(data1[i + 2] - data2[i + 2]) > 10) {
      diffCount++;
    }
  }
  
  const diffPercentage = (diffCount * step) / (data1.length / 4);
  return diffPercentage > threshold;
}

function dataURItoBlob(dataURI) {
  const byteString = atob(dataURI.split(',')[1]);
  const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  
  return new Blob([ab], { type: mimeString });
}