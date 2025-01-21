export class TTSEngine {
  constructor() {
    this.synth = window.speechSynthesis;
    this.voice = null;
    this.queue = Promise.resolve();
    this.initVoice();
  }

  async initVoice() {
    await new Promise(resolve => {
      if (this.synth.getVoices().length) {
        this.setDefaultVoice();
        resolve();
      } else {
        this.synth.onvoiceschanged = () => {
          this.setDefaultVoice();
          resolve();
        };
      }
    });
  }

  setDefaultVoice() {
    const voices = this.synth.getVoices();
    this.voice = voices.find(voice => voice.lang.startsWith('en')) || voices[0];
  }

  setVoice(voice) {
    this.voice = voice;
  }

  async speak(text) {
    // Queue the speech and return a promise
    return this.queue = this.queue.then(() => this.speakNow(text));
  }

  speakNow(text) {
    return new Promise((resolve) => {
      if (!text) {
        resolve();
        return;
      }

      // Cancel any ongoing speech
      this.synth.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      if (this.voice) {
        utterance.voice = this.voice;
      }
      
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      
      this.synth.speak(utterance);
    });
  }
}