/**
 * Headless ROM runner: loads a ROM, runs it for a number of cycles, then dumps
 * the 64x32 framebuffer to the terminal as ASCII. Useful for verifying
 * rendering and opcode behaviour without a browser.
 *
 *   npm run test:rom -- public/roms/pong.ch8 [cycles]
 */
import { readFileSync } from 'node:fs';
import { CPU, DISPLAY_HEIGHT, DISPLAY_WIDTH } from '../src/cpu';

function renderAscii(display: Uint8Array): string {
  let out = '+' + '-'.repeat(DISPLAY_WIDTH) + '+\n';
  for (let y = 0; y < DISPLAY_HEIGHT; y++) {
    out += '|';
    for (let x = 0; x < DISPLAY_WIDTH; x++) {
      out += display[y * DISPLAY_WIDTH + x] ? '█' : ' ';
    }
    out += '|\n';
  }
  out += '+' + '-'.repeat(DISPLAY_WIDTH) + '+';
  return out;
}

const romPath = process.argv[2] ?? 'public/roms/pong.ch8';
const cycles = Number(process.argv[3] ?? 600);

const rom = new Uint8Array(readFileSync(romPath));
// Deterministic RNG so runs are reproducible.
let seed = 0x2545f491;
const rng = (): number => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return (seed >> 16) & 0xff;
};

const cpu = new CPU({}, rng);
cpu.loadRom(rom);

// Roughly emulate frames: tick timers every ~10 cycles (≈60 Hz at 600 Hz CPU).
for (let i = 0; i < cycles; i++) {
  cpu.step();
  if (i % 10 === 9) cpu.tickTimers();
}

const lit = cpu.display.reduce((sum, p) => sum + p, 0);
console.log(`ROM:    ${romPath}`);
console.log(`Cycles: ${cycles}`);
console.log(`Lit px: ${lit} / ${cpu.display.length}`);
console.log(renderAscii(cpu.display));
