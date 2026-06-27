/**
 * A single square-wave beeper driven by the CHIP-8 sound timer. The oscillator
 * runs continuously and is gated by toggling the gain, which avoids clicks and
 * the cost of recreating nodes every frame.
 */
export class Beeper {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private playing = false;

  constructor(
    private readonly frequency = 440,
    private readonly volume = 0.05,
  ) {}

  /** Lazily create the audio graph. Must be triggered by a user gesture. */
  private ensure(): void {
    if (this.ctx) return;
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctx();

    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = this.frequency;

    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0;

    osc.connect(this.gain).connect(this.ctx.destination);
    osc.start();
  }

  /** Turn the tone on or off based on whether the sound timer is non-zero. */
  setPlaying(on: boolean): void {
    if (on === this.playing) return;
    this.ensure();
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
    this.playing = on;
    if (this.gain && this.ctx) {
      this.gain.gain.setTargetAtTime(
        on ? this.volume : 0,
        this.ctx.currentTime,
        0.01,
      );
    }
  }
}
