/**
 * Maps a PC keyboard onto the 16-key CHIP-8 hexadecimal keypad.
 *
 *   CHIP-8 keypad        Keyboard
 *   1 2 3 C              1 2 3 4
 *   4 5 6 D              Q W E R
 *   7 8 9 E              A S D F
 *   A 0 B F              Z X C V
 */
const KEY_MAP: Record<string, number> = {
  Digit1: 0x1,
  Digit2: 0x2,
  Digit3: 0x3,
  Digit4: 0xc,
  KeyQ: 0x4,
  KeyW: 0x5,
  KeyE: 0x6,
  KeyR: 0xd,
  KeyA: 0x7,
  KeyS: 0x8,
  KeyD: 0x9,
  KeyF: 0xe,
  KeyZ: 0xa,
  KeyX: 0x0,
  KeyC: 0xb,
  KeyV: 0xf,
};

export class Keypad {
  /** Live key state, shared with the CPU (one byte per key, 0/1). */
  readonly keys: Uint8Array;

  /**
   * @param keys Optional external buffer to write into. Pass `cpu.keys` so the
   *   CPU and keypad share a single source of truth.
   */
  constructor(keys: Uint8Array = new Uint8Array(16)) {
    this.keys = keys;
  }

  private readonly onDown = (e: KeyboardEvent): void => {
    const key = KEY_MAP[e.code];
    if (key !== undefined) {
      this.keys[key] = 1;
      e.preventDefault();
    }
  };

  private readonly onUp = (e: KeyboardEvent): void => {
    const key = KEY_MAP[e.code];
    if (key !== undefined) {
      this.keys[key] = 0;
      e.preventDefault();
    }
  };

  /** Start listening for keyboard events on the given target (default window). */
  attach(target: GlobalEventHandlers = window): void {
    target.addEventListener('keydown', this.onDown as EventListener);
    target.addEventListener('keyup', this.onUp as EventListener);
  }

  detach(target: GlobalEventHandlers = window): void {
    target.removeEventListener('keydown', this.onDown as EventListener);
    target.removeEventListener('keyup', this.onUp as EventListener);
  }

  reset(): void {
    this.keys.fill(0);
  }
}

export { KEY_MAP };
