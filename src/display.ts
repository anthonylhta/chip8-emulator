import { DISPLAY_HEIGHT, DISPLAY_WIDTH } from './cpu';

/**
 * Renders the CHIP-8 64x32 framebuffer onto an HTML canvas. The pixels are
 * drawn into a small offscreen buffer and then blitted, scaled up by an
 * integer factor with smoothing disabled so they stay crisp.
 */
export class Display {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly buffer: HTMLCanvasElement;
  private readonly bufferCtx: CanvasRenderingContext2D;
  private readonly image: ImageData;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    scale = 12,
    private onColor = '#9bbc0f',
    private offColor = '#0f380f',
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;

    canvas.width = DISPLAY_WIDTH * scale;
    canvas.height = DISPLAY_HEIGHT * scale;
    ctx.imageSmoothingEnabled = false;

    this.buffer = document.createElement('canvas');
    this.buffer.width = DISPLAY_WIDTH;
    this.buffer.height = DISPLAY_HEIGHT;
    const bufferCtx = this.buffer.getContext('2d');
    if (!bufferCtx) throw new Error('2D buffer context unavailable');
    this.bufferCtx = bufferCtx;
    this.image = bufferCtx.createImageData(DISPLAY_WIDTH, DISPLAY_HEIGHT);

    this.clear();
  }

  /** Paint the framebuffer (one byte per pixel, 0/1) onto the canvas. */
  render(framebuffer: Uint8Array): void {
    const on = hexToRgb(this.onColor);
    const off = hexToRgb(this.offColor);
    const data = this.image.data;

    for (let i = 0; i < framebuffer.length; i++) {
      const color = framebuffer[i] ? on : off;
      const o = i * 4;
      data[o] = color[0];
      data[o + 1] = color[1];
      data[o + 2] = color[2];
      data[o + 3] = 255;
    }

    this.bufferCtx.putImageData(this.image, 0, 0);
    this.ctx.drawImage(
      this.buffer,
      0,
      0,
      this.canvas.width,
      this.canvas.height,
    );
  }

  clear(): void {
    this.ctx.fillStyle = this.offColor;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  setColors(onColor: string, offColor: string): void {
    this.onColor = onColor;
    this.offColor = offColor;
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const v = hex.replace('#', '');
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ];
}
