import { test, expect } from '@playwright/test';

test('boots, autoloads Pong, and renders to the canvas', async ({ page }) => {
  await page.goto('/');

  // The app autoloads Pong on startup.
  await expect(page.locator('#status')).toContainText('Running Pong', {
    timeout: 15_000,
  });

  await expect(page.locator('#screen')).toBeVisible();

  // Poll the framebuffer until the emulator has drawn lit pixels — i.e. any
  // pixel that differs from the off/background colour (#0f380f).
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const canvas = document.querySelector('canvas');
          const ctx = canvas?.getContext('2d');
          if (!canvas || !ctx) return 0;
          const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
          let lit = 0;
          for (let i = 0; i < data.length; i += 4) {
            const isBackground =
              data[i] === 0x0f && data[i + 1] === 0x38 && data[i + 2] === 0x0f;
            if (!isBackground) lit++;
          }
          return lit;
        }),
      { timeout: 15_000, message: 'expected the canvas to render lit pixels' },
    )
    .toBeGreaterThan(0);
});

test('can load a different ROM from the picker', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#status')).toContainText('Running Pong', {
    timeout: 15_000,
  });

  await page.locator('#rom-select').selectOption('Tetris');
  await expect(page.locator('#status')).toContainText('Running Tetris');
});
