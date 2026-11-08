export class GameAudio {
  constructor(enabled = false) {
    this.enabled = enabled;
    this.context = null;
  }

  unlock() {
    if (!this.enabled) return;
    try {
      this.context ??= new (window.AudioContext || window.webkitAudioContext)();
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
    } catch { /* Audio is optional, including on browsers without Web Audio. */ }
  }

  tone(frequency, duration, volume, offset = 0) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    try {
      const now = this.context.currentTime + offset;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(gain);
      gain.connect(this.context.destination);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.02);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    } catch { /* An audio-device change must never interrupt a game. */ }
  }

  drop() { this.tone(260, 0.09, 0.035); }
  merge(tier) {
    const pitch = 330 * 2 ** ((tier % 12) / 12);
    this.tone(pitch, 0.23, 0.055);
    this.tone(pitch * 1.5, 0.3, 0.025, 0.06);
  }
}
