# Milestones

## Milestone 1 — Playable emulator

- [x] Loads a ROM (bundled picker + file input)
- [x] Renders the 64×32 framebuffer to canvas
- [x] Runs Pong
- [x] All 35 opcodes implemented
- [x] Sound timer (square-wave beeper)

> Status: **Milestone 1 complete.** Pong, Tetris and the corax+ opcode
> conformance ROM all run. Opcode behaviour is verified by a headless test
> suite (`npm test`) and a framebuffer dump tool (`npm run test:rom`).

## Possible next steps (Milestone 2+)

- [ ] Configurable quirks UI (toggle COSMAC vs. SUPER-CHIP behaviour live)
- [ ] SUPER-CHIP (SCHIP) extensions: 128×64 hi-res, scrolling, `00FX` opcodes
- [ ] XO-CHIP extensions (extended memory, colour planes, better audio)
- [ ] Save / load state and a step-debugger with register/memory views
- [ ] Per-game key remapping and on-screen touch keypad for mobile
- [ ] Adjustable colour themes and CRT shader
- [ ] Deploy to GitHub Pages via CI
