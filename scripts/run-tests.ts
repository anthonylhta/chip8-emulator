/**
 * Tiny zero-dependency unit-test harness for the CPU core. Each test
 * hand-assembles a short program, runs it, and asserts on the resulting state.
 * Run with: npm test
 */
import { CPU, FONT_START, PROGRAM_START } from '../src/cpu';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function test(name: string, fn: () => void): void {
  const before = failed;
  fn();
  const ok = failed === before;
  console.log(`${ok ? '✓' : '✗'} ${name}`);
}

/** Load a program (array of 16-bit opcodes) and return a primed CPU. */
function load(program: number[], rng?: () => number): CPU {
  const bytes = new Uint8Array(program.length * 2);
  program.forEach((op, i) => {
    bytes[i * 2] = (op >> 8) & 0xff;
    bytes[i * 2 + 1] = op & 0xff;
  });
  const cpu = new CPU({}, rng);
  cpu.loadRom(bytes);
  return cpu;
}

function run(cpu: CPU, steps: number): void {
  for (let i = 0; i < steps; i++) cpu.step();
}

test('6XNN / 7XNN: load immediate and add', () => {
  const cpu = load([0x600a, 0x7005]); // V0 = 0x0A; V0 += 5
  run(cpu, 2);
  assert(cpu.V[0] === 0x0f, `V0 should be 0x0f, got ${cpu.V[0].toString(16)}`);
});

test('7XNN wraps at 8 bits without setting VF', () => {
  const cpu = load([0x60ff, 0x7002]); // V0 = 0xFF; V0 += 2 -> 0x01
  run(cpu, 2);
  assert(cpu.V[0] === 0x01, `V0 should wrap to 1, got ${cpu.V[0]}`);
  assert(cpu.V[0xf] === 0, 'VF must be untouched by 7XNN');
});

test('8XY4: ADD sets carry in VF', () => {
  const cpu = load([0x60ff, 0x6101, 0x8014]); // V0=0xFF, V1=1, V0+=V1
  run(cpu, 3);
  assert(cpu.V[0] === 0x00, `V0 should wrap to 0, got ${cpu.V[0]}`);
  assert(cpu.V[0xf] === 1, 'VF should be 1 (carry)');
});

test('8XY5: SUB sets NOT-borrow in VF', () => {
  const cpu = load([0x6005, 0x6103, 0x8015]); // V0=5, V1=3, V0-=V1
  run(cpu, 3);
  assert(cpu.V[0] === 2, `V0 should be 2, got ${cpu.V[0]}`);
  assert(cpu.V[0xf] === 1, 'VF should be 1 (no borrow)');
});

test('8XY5: borrow clears VF', () => {
  const cpu = load([0x6003, 0x6105, 0x8015]); // V0=3, V1=5, V0-=V1
  run(cpu, 3);
  assert(cpu.V[0] === 0xfe, `V0 should be 0xfe, got ${cpu.V[0].toString(16)}`);
  assert(cpu.V[0xf] === 0, 'VF should be 0 (borrow)');
});

test('8XY6: SHR puts shifted-out bit in VF', () => {
  const cpu = load([0x6003, 0x8016]); // V0=3, V0 >>= 1 -> 1, VF=1
  run(cpu, 2);
  assert(cpu.V[0] === 1, `V0 should be 1, got ${cpu.V[0]}`);
  assert(cpu.V[0xf] === 1, 'VF should hold the shifted-out LSB');
});

test('8XYE: SHL puts high bit in VF', () => {
  const cpu = load([0x6081, 0x801e]); // V0=0x81, V0 <<= 1 -> 0x02, VF=1
  run(cpu, 2);
  assert(cpu.V[0] === 0x02, `V0 should be 0x02, got ${cpu.V[0].toString(16)}`);
  assert(cpu.V[0xf] === 1, 'VF should hold the shifted-out MSB');
});

test('3XNN / 4XNN: conditional skips', () => {
  // V0=5; skip-if-eq-5 over a "V0=0xFF"; then V0+=1
  const cpu = load([0x6005, 0x3005, 0x60ff, 0x7001]);
  run(cpu, 3); // load, skip (taken), add
  assert(cpu.V[0] === 6, `V0 should be 6 (0xFF was skipped), got ${cpu.V[0]}`);
});

test('2NNN / 00EE: call and return', () => {
  // 0x200 CALL 0x206; 0x202 V1=0xAA; 0x204 JP 0x204 (halt-ish)
  // 0x206 V0=0x11; 0x208 RET
  const cpu = load([0x2206, 0x61aa, 0x1204, 0x6011, 0x00ee]);
  run(cpu, 1); // CALL
  assert(cpu.pc === 0x206, `pc should be 0x206, got ${cpu.pc.toString(16)}`);
  assert(cpu.sp === 1, 'stack pointer should be 1 after CALL');
  run(cpu, 2); // V0=0x11, RET
  assert(cpu.V[0] === 0x11, 'subroutine should have run');
  assert(
    cpu.pc === 0x202,
    `pc should return to 0x202, got ${cpu.pc.toString(16)}`,
  );
  assert(cpu.sp === 0, 'stack pointer should be 0 after RET');
});

test('ANNN / FX1E: index register', () => {
  const cpu = load([0xa300, 0x6005, 0xf01e]); // I=0x300; V0=5; I+=V0
  run(cpu, 3);
  assert(cpu.I === 0x305, `I should be 0x305, got ${cpu.I.toString(16)}`);
});

test('FX33: BCD of 156', () => {
  const cpu = load([0x609c, 0xa400, 0xf033]); // V0=156, I=0x400, BCD
  run(cpu, 3);
  assert(cpu.memory[0x400] === 1, 'hundreds digit');
  assert(cpu.memory[0x401] === 5, 'tens digit');
  assert(cpu.memory[0x402] === 6, 'ones digit');
});

test('FX55 / FX65: store and load registers (I advances)', () => {
  // V0=1,V1=2,V2=3; I=0x400; store V0..V2; clear; load back
  const cpu = load([
    0x6001, 0x6102, 0x6203, 0xa400, 0xf255, 0x6000, 0x6100, 0x6200, 0xa400,
    0xf265,
  ]);
  run(cpu, 5); // through FX55
  assert(
    cpu.memory[0x400] === 1 && cpu.memory[0x402] === 3,
    'stored to memory',
  );
  assert(cpu.I === 0x403, 'I should advance by X+1 (COSMAC quirk)');
  run(cpu, 5); // clears + reload
  assert(
    cpu.V[0] === 1 && cpu.V[1] === 2 && cpu.V[2] === 3,
    'registers reloaded from memory',
  );
});

test('DXYN: draws font glyph and reports no collision', () => {
  // I -> font '0'; draw 5-row sprite at (0,0)
  const cpu = load([0x6000, 0xf029, 0xd005]); // V0=0, I=font(V0), draw
  run(cpu, 3);
  const lit = cpu.display.reduce((s, p) => s + p, 0);
  assert(lit > 0, 'some pixels should be lit');
  assert(cpu.V[0xf] === 0, 'no collision on first draw');
});

test('DXYN: redrawing same sprite clears it and flags collision', () => {
  const cpu = load([0x6000, 0xf029, 0xd005, 0xd005]); // draw twice
  run(cpu, 4);
  const lit = cpu.display.reduce((s, p) => s + p, 0);
  assert(lit === 0, 'second identical draw should erase the sprite');
  assert(cpu.V[0xf] === 1, 'collision flag should be set');
});

test('CXNN: RND is masked by NN', () => {
  const cpu = load([0xc00f], () => 0xab); // V0 = 0xAB & 0x0F
  run(cpu, 1);
  assert(cpu.V[0] === 0x0b, `V0 should be 0x0b, got ${cpu.V[0].toString(16)}`);
});

test('EX9E / EXA1: key skips', () => {
  const cpu = load([0x6005, 0xe09e, 0x60ff, 0x60aa]); // V0=5; SKP V0; ...
  cpu.keys[5] = 1; // key 5 down → skip the 0x60ff
  run(cpu, 3);
  assert(
    cpu.V[0] === 0xaa,
    `0x60ff should be skipped, got ${cpu.V[0].toString(16)}`,
  );
});

test('FX0A: blocks until a key is pressed', () => {
  const cpu = load([0xf00a, 0x61bb]); // wait for key into V0; then V1=0xBB
  run(cpu, 1);
  assert(cpu.pc === PROGRAM_START, 'pc should not advance while waiting');
  cpu.keys[0xc] = 1;
  run(cpu, 2);
  assert(cpu.V[0] === 0xc, `V0 should capture key 0xC, got ${cpu.V[0]}`);
  assert(cpu.V[1] === 0xbb, 'execution should resume after key press');
});

test('00E0: clears the display', () => {
  const cpu = load([0x6000, 0xf029, 0xd005, 0x00e0]);
  run(cpu, 4);
  const lit = cpu.display.reduce((s, p) => s + p, 0);
  assert(lit === 0, 'display should be empty after CLS');
});

test('font set is loaded at 0x50', () => {
  const cpu = load([0x0000]);
  assert(cpu.memory[FONT_START] === 0xf0, 'first font byte should be 0xF0');
});

console.log('');
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
