export class VideoCapture {
  async startCapture() {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'never'
        },
        audio: false
      });
      return stream;
    } catch (error) {
      console.error('Error starting capture:', error);
      throw error;
    }
  }
}