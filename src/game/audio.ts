/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// ============================================================================
// AUDIO SYSTEM (Web Audio API Procedural Synthesizer)
// ============================================================================
// Creates realistic whistles, sheep bleats, ripples, and victory fanfare
// without relying on missing external audio files.

class SoundManager {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;

  private initContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  // Soft click / command ripple sound
  public playCommandWhistle() {
    if (!this.enabled) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      // Shepherd trill / whistle slide
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(1800, now + 0.08);
      osc.frequency.exponentialRampToValueAtTime(1400, now + 0.16);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.25);
    } catch {
      // Audio context might be restricted before interaction
    }
  }

  // Sheep bleat sound
  public playSheepBleat(kind: 'sheep' | 'ram') {
    if (!this.enabled) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const vibrato = this.ctx.createOscillator();
      const vibratoGain = this.ctx.createGain();
      const gain = this.ctx.createGain();

      // Ram has deeper pitch than normal sheep
      const baseFreq = kind === 'ram' ? 190 : 280;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(baseFreq, now);

      // Tremolo / vibrato for "baa-aa-aa"
      vibrato.frequency.setValueAtTime(8, now);
      vibratoGain.gain.setValueAtTime(18, now);
      vibrato.connect(vibratoGain);
      vibratoGain.connect(osc.frequency);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.09, now + 0.05);
      gain.gain.linearRampToValueAtTime(0.07, now + 0.25);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      vibrato.start(now);
      osc.start(now);
      vibrato.stop(now + 0.5);
      osc.stop(now + 0.5);
    } catch {
      // Audio context might be restricted
    }
  }

  // Pen entry gentle chime
  public playPenChime() {
    if (!this.enabled) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.15); // E5

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.45);
    } catch {
      // Ignore
    }
  }

  // Big triumphant victory fanfare!
  public playWinFanfare() {
    if (!this.enabled) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const notes = [
        { f: 523.25, t: 0, d: 0.15 },    // C5
        { f: 659.25, t: 0.16, d: 0.15 }, // E5
        { f: 783.99, t: 0.32, d: 0.18 }, // G5
        { f: 1046.5, t: 0.52, d: 0.6 },  // C6
      ];

      notes.forEach(({ f, t, d }) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now + t);

        gain.gain.setValueAtTime(0.001, now + t);
        gain.gain.linearRampToValueAtTime(0.18, now + t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + t + d);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.start(now + t);
        osc.stop(now + t + d + 0.05);
      });
    } catch {
      // Ignore
    }
  }
}

export const sounds = new SoundManager();
