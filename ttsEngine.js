export class TTSEngine {
  constructor() {
    this.synth = window.speechSynthesis;
    this.voices = new Map();
    this.defaultVoice = null;
    this.initVoices();
  }

  initVoices() {
    // Wait for voices to be loaded
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = () => {
        const availableVoices = this.synth.getVoices();
        // Prefer an English voice for default
        this.defaultVoice = availableVoices.find(voice => voice.lang.startsWith('en')) || availableVoices[0];
        
        // Randomly assign different English voices to speakers
        this.englishVoices = availableVoices.filter(voice => voice.lang.startsWith('en'));
      };
    }
  }

  getVoiceForSpeaker(speakerName) {
    if (!speakerName) return this.defaultVoice;
    
    if (!this.voices.has(speakerName)) {
      // Assign a random English voice for this speaker
      const randomVoice = this.englishVoices[Math.floor(Math.random() * this.englishVoices.length)];
      this.voices.set(speakerName, randomVoice || this.defaultVoice);
    }
    
    return this.voices.get(speakerName);
  }

  async speak(text, speakerName) {
    return new Promise((resolve) => {
      if (!text) {
        resolve();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = this.getVoiceForSpeaker(speakerName);
      
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      
      this.synth.speak(utterance);
    });
  }
}