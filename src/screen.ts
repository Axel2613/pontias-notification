// Draws the iPhone lock screen (wallpaper, clock, status bar, notification)
// into an offscreen canvas used as the display texture.

export const SCREEN_PT = {w: 393, h: 852};
export const TEX_SCALE = 3.6; // texture px per point -> 1415 x 3067 px
export const TEX_W = Math.round(SCREEN_PT.w * TEX_SCALE);
export const TEX_H = Math.round(SCREEN_PT.h * TEX_SCALE);

// Notification layout (in points)
export const NOTIF = {
  x: 10,
  w: 373,
  y: 556,
  radius: 23,
  pad: 14,
  icon: 38,
};

const SANS = `Inter, "Noto Color Emoji", sans-serif`;
const DISPLAY = `"Inter Display", Inter, sans-serif`;

export const NOTIF_TEXT = {
  sender: 'LE PONTIAS',
  title: 'Vous nous avez manqué ❤️',
  body: 'Bonne nouvelle\u00A0: on rouvre demain, jeudi\u00A019\u00A0novembre.',
  time: 'maintenant',
};

const roundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

const wrap = (ctx: CanvasRenderingContext2D, text: string, maxW: number) => {
  const words = text.split(' '); // NBSP (U+00A0) keeps groups together
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  // keep "19 novembre." together with typographic non-breaking behaviour
  return lines;
};

export type ScreenAssets = {
  wallpaper: HTMLImageElement;
  blurred: HTMLCanvasElement;
};

export const prepareAssets = (img: HTMLImageElement): ScreenAssets => {
  const blurred = document.createElement('canvas');
  blurred.width = TEX_W;
  blurred.height = TEX_H;
  const b = blurred.getContext('2d')!;
  b.filter = `blur(${28 * TEX_SCALE}px) saturate(1.6)`;
  drawCover(b, img, TEX_W, TEX_H);
  return {wallpaper: img, blurred};
};

const drawCover = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  W: number,
  H: number,
) => {
  const s = Math.max(W / img.width, H / img.height);
  const w = img.width * s;
  const h = img.height * s;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
};

export const notifHeight = (ctx: CanvasRenderingContext2D) => {
  ctx.font = `400 15px ${SANS}`;
  const textW = NOTIF.w - NOTIF.pad * 2 - NOTIF.icon - 11;
  const lines = wrap(ctx, NOTIF_TEXT.body, textW).length;
  return NOTIF.pad * 2 + 18 + 20 + lines * 20;
};

export const drawScreen = (
  canvas: HTMLCanvasElement,
  assets: ScreenAssets,
  notif: {progress: number; opacity: number},
) => {
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, TEX_W, TEX_H);
  drawCover(ctx, assets.wallpaper, TEX_W, TEX_H);

  ctx.setTransform(TEX_SCALE, 0, 0, TEX_SCALE, 0, 0);
  const {w: W} = SCREEN_PT;

  // Subtle top gradient for status bar legibility
  const g = ctx.createLinearGradient(0, 0, 0, 260);
  g.addColorStop(0, 'rgba(0,0,0,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, 260);

  // ---- Status bar ----
  ctx.fillStyle = '#fff';
  // signal bars
  const sx = 296;
  for (let i = 0; i < 4; i++) {
    const h = 4 + i * 2.4;
    roundRect(ctx, sx + i * 4.6, 27 - h, 3, h, 1);
    ctx.fill();
  }
  // wifi
  ctx.save();
  ctx.translate(326, 27);
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.lineWidth = 2;
  for (const r of [3.5, 7, 10.5]) {
    ctx.beginPath();
    ctx.arc(0, 0, r, -Math.PI * 0.75, -Math.PI * 0.25);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, -0.5, 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // battery
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 1;
  roundRect(ctx, 343.5, 17.5, 24, 12, 3.6);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  roundRect(ctx, 345.5, 19.5, 17, 8, 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  roundRect(ctx, 368.5, 21.5, 1.6, 4, 0.8);
  ctx.fill();
  // carrier-free left: lock icon centered below island
  ctx.fillStyle = '#fff';
  ctx.save();
  ctx.translate(W / 2, 64);
  roundRect(ctx, -6, -1, 12, 9, 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(0, -2, 3.8, Math.PI, 0);
  ctx.lineTo(3.8, -1);
  ctx.moveTo(-3.8, -2);
  ctx.lineTo(-3.8, -1);
  ctx.stroke();
  ctx.restore();

  // ---- Dynamic Island ----
  ctx.fillStyle = '#000';
  roundRect(ctx, W / 2 - 62.5, 11, 125, 36.5, 18.25);
  ctx.fill();
  ctx.fillStyle = '#0b0d14';
  ctx.beginPath();
  ctx.arc(W / 2 + 43, 29.25, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1b2240';
  ctx.beginPath();
  ctx.arc(W / 2 + 43, 29.25, 2.6, 0, Math.PI * 2);
  ctx.fill();

  // ---- Date & clock ----
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 8;
  ctx.font = `600 20px ${SANS}`;
  ctx.fillText('mercredi 18 novembre', W / 2, 108);
  ctx.font = `600 104px ${DISPLAY}`;
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  ctx.fillText('18:30', W / 2, 205);
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';

  // ---- Bottom controls ----
  for (const cx of [54, W - 54]) {
    ctx.fillStyle = 'rgba(30,30,30,0.42)';
    ctx.beginPath();
    ctx.arc(cx, 786, 25, 0, Math.PI * 2);
    ctx.fill();
  }
  // flashlight glyph
  ctx.fillStyle = '#fff';
  ctx.save();
  ctx.translate(54, 786);
  roundRect(ctx, -4, -11, 8, 6, 1.5);
  ctx.fill();
  roundRect(ctx, -3, -4, 6, 14, 1.5);
  ctx.fill();
  ctx.restore();
  // camera glyph
  ctx.save();
  ctx.translate(W - 54, 786);
  roundRect(ctx, -11, -7, 22, 15, 3.5);
  ctx.fill();
  roundRect(ctx, -4.5, -10, 9, 4, 1.5);
  ctx.fill();
  ctx.fillStyle = 'rgba(30,30,30,0.9)';
  ctx.beginPath();
  ctx.arc(0, 0.5, 4.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, 0.5, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // home indicator
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  roundRect(ctx, W / 2 - 67, 836, 134, 5, 2.5);
  ctx.fill();

  // ---- Notification ----
  if (notif.opacity > 0.001) {
    const h = notifHeight(ctx);
    const p = notif.progress;
    const scale = 0.9 + 0.1 * p;
    const dy = (1 - p) * 90;
    const cx = NOTIF.x + NOTIF.w / 2;
    const cy = NOTIF.y + h / 2 + dy;
    ctx.save();
    ctx.globalAlpha = notif.opacity;
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-NOTIF.w / 2, -h / 2);

    // soft drop shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 6 * TEX_SCALE;
    roundRect(ctx, 0, 0, NOTIF.w, h, NOTIF.radius);
    ctx.fillStyle = 'rgba(0,0,0,0.01)';
    ctx.fill();
    ctx.restore();

    // frosted glass: blurred wallpaper clipped + light tint
    ctx.save();
    roundRect(ctx, 0, 0, NOTIF.w, h, NOTIF.radius);
    ctx.clip();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(assets.blurred, 0, 0);
    ctx.restore();
    ctx.save();
    roundRect(ctx, 0, 0, NOTIF.w, h, NOTIF.radius);
    ctx.fillStyle = 'rgba(246,246,248,0.80)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ctx.restore();

    // App icon
    const ix = NOTIF.pad;
    const iy = NOTIF.pad + 1;
    const ig = ctx.createLinearGradient(0, iy, 0, iy + NOTIF.icon);
    ig.addColorStop(0, '#8a1c2b');
    ig.addColorStop(1, '#5a0f1a');
    ctx.fillStyle = ig;
    roundRect(ctx, ix, iy, NOTIF.icon, NOTIF.icon, 9);
    ctx.fill();
    ctx.fillStyle = '#f4e6cf';
    ctx.textAlign = 'center';
    ctx.font = `italic 600 25px Georgia, "DejaVu Serif", serif`;
    ctx.fillText('P', ix + NOTIF.icon / 2, iy + 28);
    ctx.strokeStyle = 'rgba(244,230,207,0.55)';
    ctx.lineWidth = 0.8;
    roundRect(ctx, ix + 4, iy + 4, NOTIF.icon - 8, NOTIF.icon - 8, 6);
    ctx.stroke();

    // Text
    const tx = ix + NOTIF.icon + 11;
    const textW = NOTIF.w - NOTIF.pad - tx;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#000';
    ctx.font = `600 15px ${SANS}`;
    ctx.fillText(NOTIF_TEXT.sender, tx, NOTIF.pad + 14);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(60,60,67,0.62)';
    ctx.font = `400 13.5px ${SANS}`;
    ctx.fillText(NOTIF_TEXT.time, NOTIF.w - NOTIF.pad, NOTIF.pad + 14);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#000';
    ctx.font = `600 15px ${SANS}`;
    ctx.fillText(NOTIF_TEXT.title, tx, NOTIF.pad + 14 + 21);
    ctx.font = `400 15px ${SANS}`;
    ctx.fillStyle = '#111';
    const lines = wrap(ctx, NOTIF_TEXT.body, textW);
    lines.forEach((l, i) => ctx.fillText(l, tx, NOTIF.pad + 14 + 41 + i * 20));
    ctx.restore();
  }
};
