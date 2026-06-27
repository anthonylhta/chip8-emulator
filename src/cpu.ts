/**
 * CHIP-8 CPU core.
 *
 * Pure logic with no DOM dependencies so it can be unit-tested and run
 * headlessly. Rendering, input and audio are wired up by the caller via the
 * public `display`, `keys` and `soundTimer` state.
 *
 * References:
 *   - Cowgod's Chip-8 Technical Reference v1.0
 *   - Tobias V. Langhoff, "Guide to making a CHIP-8 emulator"
 */

export const MEMORY_SIZE = 4096;
export const PROGRAM_START = 0x200;
export const REGISTER_COUNT = 16;
export const STACK_SIZE = 16;
export const DISPLAY_WIDTH = 64;
export const DISPLAY_HEIGHT = 32;
export const FONT_START = 0x50;

/** 16 characters (0-F), 5 bytes each = 80 bytes, loaded at {@link FONT_START}. */
// prettier-ignore
const FONT_SET = [
  0xf0, 0x90, 0x90, 0x90, 0xf0, // 0
  0x20, 0x60, 0x20, 0x20, 0x70, // 1
  0xf0, 0x10, 0xf0, 0x80, 0xf0, // 2
  0xf0, 0x10, 0xf0, 0x10, 0xf0, // 3
  0x90, 0x90, 0xf0, 0x10, 0x10, // 4
  0xf0, 0x80, 0xf0, 0x10, 0xf0, // 5
  0xf0, 0x80, 0xf0, 0x90, 0xf0, // 6
  0xf0, 0x10, 0x20, 0x40, 0x40, // 7
  0xf0, 0x90, 0xf0, 0x90, 0xf0, // 8
  0xf0, 0x90, 0xf0, 0x10, 0xf0, // 9
  0xf0, 0x90, 0xf0, 0x90, 0x90, // A
  0xe0, 0x90, 0xe0, 0x90, 0xe0, // B
  0xf0, 0x80, 0x80, 0x80, 0xf0, // C
  0xe0, 0x90, 0x90, 0x90, 0xe0, // D
  0xf0, 0x80, 0xf0, 0x80, 0xf0, // E
  0xf0, 0x80, 0xf0, 0x80, 0x80, // F
];

/**
 * Behavioural differences between CHIP-8 implementations. The defaults match
 * the original COSMAC VIP closely enough to run the classic public-domain
 * games (Pong, Tetris, Space Invaders).
 */
export interface Quirks {
  /** 8XY6/8XYE shift Vy into Vx (true, COSMAC) vs. shift Vx in place (false). */
  shiftUsesVy: boolean;
  /** FX55/FX65 increment I by X+1 (true, COSMAC) vs. leave I unchanged (false). */
  incrementIOnLoadStore: boolean;
  /** BNNN jumps to XNN + Vx (true, SUPER-CHIP) vs. NNN + V0 (false, COSMAC). */
  jumpUsesVx: boolean;
}

export const DEFAULT_QUIRKS: Quirks = {
  shiftUsesVy: false,
  incrementIOnLoadStore: true,
  jumpUsesVx: false,
};

export class CPU {
  /** 4K of addressable memory. */
  readonly memory = new Uint8Array(MEMORY_SIZE);
  /** 16 general-purpose 8-bit registers V0-VF. VF doubles as a flag register. */
  readonly V = new Uint8Array(REGISTER_COUNT);
  /** 16-bit address/index register (only the low 12 bits are meaningful). */
  I = 0;
  /** Program counter. */
  pc = PROGRAM_START;
  /** Call stack of return addresses. */
  readonly stack = new Uint16Array(STACK_SIZE);
  /** Stack pointer (index of the next free slot). */
  sp = 0;
  /** Counts down at 60 Hz; readable via FX07. */
  delayTimer = 0;
  /** Counts down at 60 Hz; while non-zero a tone should play. */
  soundTimer = 0;
  /** 64x32 monochrome framebuffer, one byte (0/1) per pixel. */
  readonly display = new Uint8Array(DISPLAY_WIDTH * DISPLAY_HEIGHT);
  /** Current keypad state, one byte (0/1) per key 0x0-0xF. */
  readonly keys = new Uint8Array(16);
  /** Set whenever the framebuffer changes so the host can repaint lazily. */
  drawFlag = false;

  readonly quirks: Quirks;
  /** Injectable RNG (0-255) so CXNN is deterministic in tests. */
  private rng: () => number;

  constructor(quirks: Partial<Quirks> = {}, rng?: () => number) {
    this.quirks = { ...DEFAULT_QUIRKS, ...quirks };
    this.rng = rng ?? (() => Math.floor(Math.random() * 256));
    this.reset();
  }

  /** Restore the CPU to power-on state and reload the font set. */
  reset(): void {
    this.memory.fill(0);
    this.V.fill(0);
    this.stack.fill(0);
    this.display.fill(0);
    this.keys.fill(0);
    this.I = 0;
    this.pc = PROGRAM_START;
    this.sp = 0;
    this.delayTimer = 0;
    this.soundTimer = 0;
    this.drawFlag = true;
    this.memory.set(FONT_SET, FONT_START);
  }

  /** Load a ROM image into memory starting at {@link PROGRAM_START}. */
  loadRom(rom: Uint8Array): void {
    this.reset();
    if (rom.length > MEMORY_SIZE - PROGRAM_START) {
      throw new Error(
        `ROM too large: ${rom.length} bytes (max ${MEMORY_SIZE - PROGRAM_START})`,
      );
    }
    this.memory.set(rom, PROGRAM_START);
  }

  /** Decrement the delay and sound timers; call at 60 Hz. */
  tickTimers(): void {
    if (this.delayTimer > 0) this.delayTimer--;
    if (this.soundTimer > 0) this.soundTimer--;
  }

  /** Fetch, decode and execute a single instruction. */
  step(): void {
    const opcode = (this.memory[this.pc] << 8) | this.memory[this.pc + 1];
    this.pc = (this.pc + 2) & 0xfff;

    const x = (opcode & 0x0f00) >> 8;
    const y = (opcode & 0x00f0) >> 4;
    const n = opcode & 0x000f;
    const nn = opcode & 0x00ff;
    const nnn = opcode & 0x0fff;
    const V = this.V;

    switch (opcode & 0xf000) {
      case 0x0000:
        switch (opcode) {
          case 0x00e0: // 00E0: CLS
            this.display.fill(0);
            this.drawFlag = true;
            break;
          case 0x00ee: // 00EE: RET
            this.sp = (this.sp - 1) & 0xf;
            this.pc = this.stack[this.sp];
            break;
          default: // 0NNN: SYS addr — ignored on modern interpreters
            break;
        }
        break;

      case 0x1000: // 1NNN: JP addr
        this.pc = nnn;
        break;

      case 0x2000: // 2NNN: CALL addr
        this.stack[this.sp] = this.pc;
        this.sp = (this.sp + 1) & 0xf;
        this.pc = nnn;
        break;

      case 0x3000: // 3XNN: SE Vx, byte
        if (V[x] === nn) this.skip();
        break;

      case 0x4000: // 4XNN: SNE Vx, byte
        if (V[x] !== nn) this.skip();
        break;

      case 0x5000: // 5XY0: SE Vx, Vy
        if (V[x] === V[y]) this.skip();
        break;

      case 0x6000: // 6XNN: LD Vx, byte
        V[x] = nn;
        break;

      case 0x7000: // 7XNN: ADD Vx, byte (no carry)
        V[x] = (V[x] + nn) & 0xff;
        break;

      case 0x8000:
        this.execArithmetic(opcode, x, y, n);
        break;

      case 0x9000: // 9XY0: SNE Vx, Vy
        if (V[x] !== V[y]) this.skip();
        break;

      case 0xa000: // ANNN: LD I, addr
        this.I = nnn;
        break;

      case 0xb000: // BNNN: JP V0, addr (BXNN under the jump quirk)
        this.pc = (nnn + (this.quirks.jumpUsesVx ? V[x] : V[0])) & 0xfff;
        break;

      case 0xc000: // CXNN: RND Vx, byte
        V[x] = this.rng() & nn;
        break;

      case 0xd000: // DXYN: DRW Vx, Vy, nibble
        this.drawSprite(V[x], V[y], n);
        break;

      case 0xe000:
        switch (nn) {
          case 0x9e: // EX9E: SKP Vx
            if (this.keys[V[x] & 0xf]) this.skip();
            break;
          case 0xa1: // EXA1: SKNP Vx
            if (!this.keys[V[x] & 0xf]) this.skip();
            break;
          default:
            this.unknown(opcode);
        }
        break;

      case 0xf000:
        this.execMisc(opcode, x, nn);
        break;

      default:
        this.unknown(opcode);
    }
  }

  /** 0x8XY_ ALU instructions. */
  private execArithmetic(
    opcode: number,
    x: number,
    y: number,
    n: number,
  ): void {
    const V = this.V;
    switch (n) {
      case 0x0: // 8XY0: LD Vx, Vy
        V[x] = V[y];
        break;
      case 0x1: // 8XY1: OR Vx, Vy
        V[x] = V[x] | V[y];
        break;
      case 0x2: // 8XY2: AND Vx, Vy
        V[x] = V[x] & V[y];
        break;
      case 0x3: // 8XY3: XOR Vx, Vy
        V[x] = V[x] ^ V[y];
        break;
      case 0x4: {
        // 8XY4: ADD Vx, Vy — VF = carry
        const sum = V[x] + V[y];
        V[x] = sum & 0xff;
        V[0xf] = sum > 0xff ? 1 : 0;
        break;
      }
      case 0x5: {
        // 8XY5: SUB Vx, Vy — VF = NOT borrow
        const noBorrow = V[x] >= V[y] ? 1 : 0;
        V[x] = (V[x] - V[y]) & 0xff;
        V[0xf] = noBorrow;
        break;
      }
      case 0x6: {
        // 8XY6: SHR Vx
        const src = this.quirks.shiftUsesVy ? V[y] : V[x];
        const lsb = src & 1;
        V[x] = (src >> 1) & 0xff;
        V[0xf] = lsb;
        break;
      }
      case 0x7: {
        // 8XY7: SUBN Vx, Vy — VF = NOT borrow
        const noBorrow = V[y] >= V[x] ? 1 : 0;
        V[x] = (V[y] - V[x]) & 0xff;
        V[0xf] = noBorrow;
        break;
      }
      case 0xe: {
        // 8XYE: SHL Vx
        const src = this.quirks.shiftUsesVy ? V[y] : V[x];
        const msb = (src >> 7) & 1;
        V[x] = (src << 1) & 0xff;
        V[0xf] = msb;
        break;
      }
      default:
        this.unknown(opcode);
    }
  }

  /** 0xFX__ timer, memory and key instructions. */
  private execMisc(opcode: number, x: number, nn: number): void {
    const V = this.V;
    switch (nn) {
      case 0x07: // FX07: LD Vx, DT
        V[x] = this.delayTimer;
        break;
      case 0x0a: {
        // FX0A: LD Vx, K — block until a key is pressed
        const key = this.keys.findIndex((pressed) => pressed === 1);
        if (key === -1) {
          this.pc = (this.pc - 2) & 0xfff; // re-execute next cycle
        } else {
          V[x] = key;
        }
        break;
      }
      case 0x15: // FX15: LD DT, Vx
        this.delayTimer = V[x];
        break;
      case 0x18: // FX18: LD ST, Vx
        this.soundTimer = V[x];
        break;
      case 0x1e: // FX1E: ADD I, Vx
        this.I = (this.I + V[x]) & 0xffff;
        break;
      case 0x29: // FX29: LD F, Vx — point I at the font sprite for digit Vx
        this.I = FONT_START + (V[x] & 0xf) * 5;
        break;
      case 0x33: // FX33: LD B, Vx — store BCD of Vx at I, I+1, I+2
        this.memory[this.I] = Math.floor(V[x] / 100);
        this.memory[this.I + 1] = Math.floor((V[x] % 100) / 10);
        this.memory[this.I + 2] = V[x] % 10;
        break;
      case 0x55: // FX55: LD [I], Vx — store V0..Vx
        for (let i = 0; i <= x; i++) this.memory[this.I + i] = V[i];
        if (this.quirks.incrementIOnLoadStore)
          this.I = (this.I + x + 1) & 0xffff;
        break;
      case 0x65: // FX65: LD Vx, [I] — load V0..Vx
        for (let i = 0; i <= x; i++) V[i] = this.memory[this.I + i];
        if (this.quirks.incrementIOnLoadStore)
          this.I = (this.I + x + 1) & 0xffff;
        break;
      default:
        this.unknown(opcode);
    }
  }

  /**
   * DXYN: XOR an N-byte sprite (read from memory at I) onto the screen at
   * (vx, vy). VF is set to 1 if any lit pixel is turned off (collision). The
   * starting coordinate wraps; pixels past the right/bottom edge are clipped.
   */
  private drawSprite(vx: number, vy: number, height: number): void {
    const startX = vx % DISPLAY_WIDTH;
    const startY = vy % DISPLAY_HEIGHT;
    this.V[0xf] = 0;

    for (let row = 0; row < height; row++) {
      const py = startY + row;
      if (py >= DISPLAY_HEIGHT) break; // clip vertically
      const spriteByte = this.memory[this.I + row];
      for (let col = 0; col < 8; col++) {
        if ((spriteByte & (0x80 >> col)) === 0) continue;
        const px = startX + col;
        if (px >= DISPLAY_WIDTH) break; // clip horizontally
        const idx = py * DISPLAY_WIDTH + px;
        if (this.display[idx] === 1) this.V[0xf] = 1; // collision
        this.display[idx] ^= 1;
      }
    }
    this.drawFlag = true;
  }

  /** Advance the PC past the next instruction (used by skip opcodes). */
  private skip(): void {
    this.pc = (this.pc + 2) & 0xfff;
  }

  private unknown(opcode: number): void {
    throw new Error(
      `Unknown opcode 0x${opcode.toString(16).padStart(4, '0')} at 0x${(
        this.pc - 2
      ).toString(16)}`,
    );
  }
}
