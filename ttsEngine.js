export class TTSEngine {
  constructor() {
    this.synth = window.speechSynthesis;
    this.voice = null;
    this.initVoice();
  }

  initVoice() {
    // Wait for voices to be loaded
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = () => {
        const voices = this.synth.getVoices();
        // Prefer an English voice
        this.voice = voices.find(voice => voice.lang.startsWith('en')) || voices[0];
      };
    }
  }

  setVoice(voice) {
    this.voice = voice;
  }

  async speak(text) {
    return new Promise((resolve) => {
      if (!text) {
        resolve();
        return;
      }

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