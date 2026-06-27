# CHIP-8 Emulator

A [CHIP-8](https://en.wikipedia.org/wiki/CHIP-8) emulator that runs in the
browser. Written in **TypeScript** with **Vite** and the **HTML canvas** — no
UI frameworks.

CHIP-8 is an interpreted virtual machine from the 1970s (originally for the
COSMAC VIP). Its tiny, well-documented instruction set makes it the classic
"hello world" of emulator writing. This project implements the full 35-opcode
instruction set and ships with public-domain games.

![keypad mapping](#keypad) <!-- placeholder; mapping is documented below -->

## Quick start

```bash
npm install
npm run dev        # start the Vite dev server, then open the printed URL
```

Pong autoloads. Pick another bundled ROM from the dropdown, or load your own
`.ch8` file with the file input.

Other scripts:

```bash
npm run build        # type-check + production build to dist/
npm run preview      # preview the production build
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run format       # prettier --write
npm test             # headless opcode unit tests (no browser needed)
npm run test:rom -- public/roms/pong.ch8 600   # run a ROM and dump the screen as ASCII
```

## Controls

The 16-key CHIP-8 hex keypad is mapped to the left-hand side of a QWERTY
keyboard:

```
 CHIP-8 keypad        Keyboard
 1 2 3 C              1 2 3 4
 4 5 6 D              Q W E R
 7 8 9 E              A S D F
 A 0 B F              Z X C V
```

In **Pong**, the left paddle is `1` (up) / `Q` (down) and the right paddle is
`4` (up) / `R` (down).

## Project layout

```
chip8-emulator/
├─ index.html          # canvas + controls
├─ src/
│  ├─ cpu.ts           # registers, 4K memory, stack, timers, fetch-decode-execute
│  ├─ display.ts       # 64×32 framebuffer → scaled canvas
│  ├─ input.ts         # keyboard → CHIP-8 keypad mapping
│  ├─ audio.ts         # square-wave beeper for the sound timer
│  ├─ main.ts          # ROM loader + ~60 Hz run loop + UI wiring
│  └─ style.css
├─ public/roms/        # bundled public-domain ROMs (served at /roms)
└─ scripts/            # headless test + ROM-dump tooling
```

## Architecture

The **CPU** (`src/cpu.ts`) is pure, DOM-free logic so it can be unit-tested and
run headlessly in Node. It exposes its `display`, `keys` and `soundTimer` state;
the browser layer renders the framebuffer, feeds key state, and beeps.

`main.ts` drives a `requestAnimationFrame` loop that executes a fixed number of
CPU cycles per frame (the **Speed** slider; default ~600 Hz) and ticks the delay
and sound timers at a wall-clock-locked 60 Hz, independent of the display's
refresh rate.

## Specification

| Component   | Detail                                                          |
| ----------- | --------------------------------------------------------------- |
| Memory      | 4096 bytes. Programs load at `0x200`. Font set lives at `0x50`. |
| Registers   | 16 × 8-bit `V0`–`VF`. `VF` is the flag/carry register.          |
| Index (`I`) | 16-bit address register.                                        |
| Stack       | 16 levels of 16-bit return addresses.                           |
| Timers      | Delay + sound, both 8-bit, decrementing at 60 Hz.               |
| Display     | 64 × 32 monochrome, drawn with XOR sprites (collision in `VF`). |
| Input       | 16-key hex keypad (`0`–`F`).                                    |
| Font        | 16 built-in 4×5 hex glyphs (`0`–`F`), 5 bytes each.             |

### Quirks

Real CHIP-8 programs disagree on a few edge cases. The defaults
(`DEFAULT_QUIRKS` in `cpu.ts`) match the original COSMAC VIP, which runs the
classic games:

- **Shift (`8XY6`/`8XYE`)** — shift `Vx` in place. _(toggle: `shiftUsesVy`)_
- **Load/Store (`FX55`/`FX65`)** — increment `I` by `X+1`. _(toggle: `incrementIOnLoadStore`)_
- **Jump (`BNNN`)** — jump to `NNN + V0`. _(toggle: `jumpUsesVx` for `BXNN`)_

Sprite drawing wraps the starting coordinate and clips pixels past the right/
bottom edges.

## Opcode checklist (all 35)

`NNN` = 12-bit address · `NN` = 8-bit constant · `N` = 4-bit constant ·
`X`/`Y` = register index.

- [x] `0NNN` — SYS addr (ignored on modern interpreters)
- [x] `00E0` — CLS — clear the display
- [x] `00EE` — RET — return from subroutine
- [x] `1NNN` — JP addr — jump to `NNN`
- [x] `2NNN` — CALL addr — call subroutine at `NNN`
- [x] `3XNN` — SE Vx, byte — skip next if `Vx == NN`
- [x] `4XNN` — SNE Vx, byte — skip next if `Vx != NN`
- [x] `5XY0` — SE Vx, Vy — skip next if `Vx == Vy`
- [x] `6XNN` — LD Vx, byte — `Vx = NN`
- [x] `7XNN` — ADD Vx, byte — `Vx += NN` (no carry)
- [x] `8XY0` — LD Vx, Vy — `Vx = Vy`
- [x] `8XY1` — OR Vx, Vy — `Vx |= Vy`
- [x] `8XY2` — AND Vx, Vy — `Vx &= Vy`
- [x] `8XY3` — XOR Vx, Vy — `Vx ^= Vy`
- [x] `8XY4` — ADD Vx, Vy — `Vx += Vy`, `VF = carry`
- [x] `8XY5` — SUB Vx, Vy — `Vx -= Vy`, `VF = NOT borrow`
- [x] `8XY6` — SHR Vx — `Vx >>= 1`, `VF = old LSB`
- [x] `8XY7` — SUBN Vx, Vy — `Vx = Vy - Vx`, `VF = NOT borrow`
- [x] `8XYE` — SHL Vx — `Vx <<= 1`, `VF = old MSB`
- [x] `9XY0` — SNE Vx, Vy — skip next if `Vx != Vy`
- [x] `ANNN` — LD I, addr — `I = NNN`
- [x] `BNNN` — JP V0, addr — jump to `NNN + V0`
- [x] `CXNN` — RND Vx, byte — `Vx = rand() & NN`
- [x] `DXYN` — DRW Vx, Vy, N — draw N-byte sprite at `(Vx,Vy)`, `VF = collision`
- [x] `EX9E` — SKP Vx — skip next if key `Vx` is pressed
- [x] `EXA1` — SKNP Vx — skip next if key `Vx` is not pressed
- [x] `FX07` — LD Vx, DT — `Vx = delay timer`
- [x] `FX0A` — LD Vx, K — wait for a key press, store in `Vx`
- [x] `FX15` — LD DT, Vx — `delay timer = Vx`
- [x] `FX18` — LD ST, Vx — `sound timer = Vx`
- [x] `FX1E` — ADD I, Vx — `I += Vx`
- [x] `FX29` — LD F, Vx — `I = address of font glyph for Vx`
- [x] `FX33` — LD B, Vx — store BCD of `Vx` at `I`, `I+1`, `I+2`
- [x] `FX55` — LD [I], Vx — store `V0..Vx` to memory at `I`
- [x] `FX65` — LD Vx, [I] — load `V0..Vx` from memory at `I`

**35 / 35 implemented.** Behaviour is exercised by `npm test` and by the
bundled `corax+` conformance ROM.

## ROMs

Bundled public-domain ROMs live in [`public/roms/`](public/roms):

| File              | Notes                                                        |
| ----------------- | ------------------------------------------------------------ |
| `pong.ch8`        | Pong (1 player). The first-milestone target game.            |
| `tetris.ch8`      | Tetris (Fran Dachille, 1991).                                |
| `chip8-logo.ch8`  | Renders a CHIP-8 logo — a quick display sanity check.        |
| `opcode-test.ch8` | `corax+` opcode conformance test from the CHIP-8 test suite. |

Drop any other `.ch8` file in with the file input.

## References

- [Cowgod's Chip-8 Technical Reference v1.0](http://devernay.free.fr/hacks/chip8/C8TECH10.HTM)
- [Tobias V. Langhoff — Guide to making a CHIP-8 emulator](https://tobiasvl.github.io/blog/write-a-chip-8-emulator/)
- [Timendus — CHIP-8 test suite](https://github.com/Timendus/chip8-test-suite)

## License

[MIT](LICENSE)
