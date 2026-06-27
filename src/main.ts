import './style.css';
import { CPU } from './cpu';
import { Display } from './display';
import { Keypad } from './input';
import { Beeper } from './audio';

const BUNDLED_ROMS: Record<string, string> = {
  Pong: 'pong.ch8',
  Tetris: 'tetris.ch8',
  'CHIP-8 logo': 'chip8-logo.ch8',
  'Opcode test (corax+)': 'opcode-test.ch8',
};

/** CPU instructions executed per rendered frame (~60 fps → ~600 Hz). */
const DEFAULT_CYCLES_PER_FRAME = 10;
const TIMER_HZ = 60;

class Emulator {
  private readonly cpu = new CPU();
  private readonly display: Display;
  private readonly keypad: Keypad;
  private readonly beeper = new Beeper();

  private rafId = 0;
  private running = false;
  private lastTimerTick = 0;
  private timerAccumulator = 0;
  private cyclesPerFrame = DEFAULT_CYCLES_PER_FRAME;
  private romName = '';
  private lastRom: Uint8Array | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.display = new Display(canvas);
    // Share a single key-state buffer between the CPU and the keypad.
    this.keypad = new Keypad(this.cpu.keys);
    this.keypad.attach();
  }

  loadRom(rom: Uint8Array, name: string): void {
    this.stop();
    this.lastRom = rom;
    this.cpu.loadRom(rom);
    this.romName = name;
    this.display.render(this.cpu.display);
    this.start();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTimerTick = performance.now();
    this.timerAccumulator = 0;
    this.loop(this.lastTimerTick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.beeper.setPlaying(false);
  }

  toggle(): boolean {
    if (this.running) this.stop();
    else this.start();
    return this.running;
  }

  /** Reload the current ROM from the start. */
  reset(): void {
    if (!this.lastRom) return;
    this.loadRom(this.lastRom, this.romName);
  }

  setSpeed(cyclesPerFrame: number): void {
    this.cyclesPerFrame = Math.max(1, cyclesPerFrame);
  }

  get isRunning(): boolean {
    return this.running;
  }

  get currentRom(): string {
    return this.romName;
  }

  private readonly loop = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.loop);

    // Run a fixed number of CPU cycles per displayed frame.
    try {
      for (let i = 0; i < this.cyclesPerFrame; i++) {
        this.cpu.step();
      }
    } catch (err) {
      console.error(err);
      this.stop();
      return;
    }

    // Tick the 60 Hz timers based on elapsed wall-clock time so timing stays
    // correct regardless of the display refresh rate.
    this.timerAccumulator += now - this.lastTimerTick;
    this.lastTimerTick = now;
    const tickMs = 1000 / TIMER_HZ;
    while (this.timerAccumulator >= tickMs) {
      this.cpu.tickTimers();
      this.timerAccumulator -= tickMs;
    }

    this.beeper.setPlaying(this.cpu.soundTimer > 0);

    if (this.cpu.drawFlag) {
      this.display.render(this.cpu.display);
      this.cpu.drawFlag = false;
    }
  };
}

// --- Bootstrapping & UI wiring -------------------------------------------

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

async function fetchRom(file: string): Promise<Uint8Array> {
  const res = await fetch(`${import.meta.env.BASE_URL}roms/${file}`);
  if (!res.ok) throw new Error(`Failed to load ROM: ${file}`);
  return new Uint8Array(await res.arrayBuffer());
}

function main(): void {
  const canvas = el<HTMLCanvasElement>('screen');
  const emulator = new Emulator(canvas);

  const status = el<HTMLSpanElement>('status');
  const setStatus = (text: string): void => {
    status.textContent = text;
  };

  // Bundled ROM picker.
  const select = el<HTMLSelectElement>('rom-select');
  for (const name of Object.keys(BUNDLED_ROMS)) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  }
  const onSelectChange = async (): Promise<void> => {
    const name = select.value;
    if (!name) return;
    try {
      const rom = await fetchRom(BUNDLED_ROMS[name]);
      emulator.loadRom(rom, name);
      setStatus(`Running ${name}`);
    } catch (err) {
      setStatus(String(err));
    }
  };
  select.addEventListener('change', () => void onSelectChange());

  // File input for arbitrary ROMs.
  const fileInput = el<HTMLInputElement>('rom-file');
  const onFileChange = async (): Promise<void> => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const rom = new Uint8Array(await file.arrayBuffer());
    emulator.loadRom(rom, file.name);
    select.value = '';
    setStatus(`Running ${file.name}`);
  };
  fileInput.addEventListener('change', () => void onFileChange());

  // Pause / resume.
  const pauseBtn = el<HTMLButtonElement>('pause');
  pauseBtn.addEventListener('click', () => {
    const running = emulator.toggle();
    pauseBtn.textContent = running ? 'Pause' : 'Resume';
    setStatus(running ? `Running ${emulator.currentRom}` : 'Paused');
  });

  // Reset.
  el<HTMLButtonElement>('reset').addEventListener('click', () => {
    emulator.reset();
    pauseBtn.textContent = 'Pause';
    setStatus(`Running ${emulator.currentRom}`);
  });

  // Speed control.
  const speed = el<HTMLInputElement>('speed');
  const speedLabel = el<HTMLSpanElement>('speed-label');
  const applySpeed = (): void => {
    const cycles = Number(speed.value);
    emulator.setSpeed(cycles);
    speedLabel.textContent = `${cycles * TIMER_HZ} Hz`;
  };
  speed.addEventListener('input', applySpeed);
  applySpeed();

  // Autoload Pong so there is something on screen immediately.
  fetchRom(BUNDLED_ROMS.Pong)
    .then((rom) => {
      emulator.loadRom(rom, 'Pong');
      select.value = 'Pong';
      setStatus('Running Pong');
    })
    .catch((err) => setStatus(String(err)));
}

main();
