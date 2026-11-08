import { appearance } from './physics.js';

export const FACE_NAMES = ['Grinsebacke', 'Freche Zunge', 'Lachflash', 'Schielmeister', 'Coolio', 'Stauni', 'Zwinkerball', 'Herzchen', 'Schelm', 'Schlafmütze', 'Sternchen', 'Zahnlücke'];
const canvases = new Map();
const images = new Map();
const INK = '#503348';

function drawFace(ctx, tier) {
  const face = tier % FACE_NAMES.length;
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = INK;
  ctx.lineWidth = 10;
  ctx.lineCap = ctx.lineJoin = 'round';
  const path = (d, fill = false, color = INK) => {
    ctx.fillStyle = ctx.strokeStyle = color;
    const shape = new Path2D(d);
    if (fill) ctx.fill(shape); else ctx.stroke(shape);
  };
  const oval = (x, y, rx, ry, color = INK) => {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  };
  const eye = (x, y = 119) => {
    oval(x, y, 11, 16);
    oval(x - 3, y - 5, 3.5, 4, '#fff9ef');
  };
  const eyes = () => { eye(88); eye(168); };
  const smile = () => path('M 95 160 Q 128 196 161 160');
  const laugh = () => {
    path('M 91 155 Q 128 165 165 155 Q 160 199 128 199 Q 96 199 91 155 Z', true);
    oval(128, 188, 20, 9, '#f18c9b');
  };
  // Broad features remain readable on the smallest balls.
  oval(64, 151, 15, 9, '#ffffff39');
  oval(192, 151, 15, 9, '#ffffff39');
  switch (face) {
    case 0:
      eyes(); smile(); break;
    case 1:
      eye(88); path('M 151 121 Q 168 106 185 121');
      path('M 96 157 Q 128 183 163 155');
      path('M 130 172 L 152 168 L 151 187 Q 142 201 132 187 Z', true, '#d95378'); break;
    case 2:
      path('M 72 123 Q 88 100 104 123 M 152 123 Q 168 100 184 123'); laugh(); break;
    case 3:
      oval(87, 120, 22, 25, '#fffaf1'); oval(168, 120, 22, 25, '#fffaf1');
      oval(96, 125, 10, 14); oval(159, 117, 10, 14);
      path('M 99 163 Q 121 181 143 165 Q 156 157 168 170'); break;
    case 4:
      path('M 57 109 L 113 109 L 108 138 Q 84 153 65 135 Z', true);
      path('M 143 109 L 199 109 L 191 135 Q 172 153 148 138 Z', true);
      path('M 112 116 Q 128 107 144 116');
      ctx.lineWidth = 5;
      path('M 73 118 L 85 131 M 158 118 L 170 131', false, '#fff9ec9e');
      ctx.lineWidth = 10; path('M 104 169 Q 132 187 158 163'); break;
    case 5:
      eyes(); oval(128, 174, 18, 24);
      path('M 74 87 Q 88 78 102 87 M 154 87 Q 168 78 182 87'); break;
    case 6:
      path('M 72 122 L 90 113 L 104 123'); eye(168); smile(); break;
    case 7:
      for (const x of [87, 169]) path(`M ${x} 143 C ${x - 49} 111 ${x - 19} 86 ${x} 108 C ${x + 19} 86 ${x + 49} 111 ${x} 143 Z`, true, '#a82f60');
      laugh(); break;
    case 8:
      path('M 70 107 L 105 119 L 73 129 M 185 107 L 150 119 L 182 129');
      smile(); oval(128, 180, 11, 8, '#e97c96'); break;
    case 9:
      path('M 70 116 Q 88 136 106 116 M 150 116 Q 168 136 186 116');
      oval(131, 172, 12, 14);
      path('M 185 73 L 207 73 L 185 95 L 207 95', false, '#7e588d'); break;
    case 10:
      for (const x of [86, 170]) {
        const points = Array.from({ length: 10 }, (_, i) => {
          const angle = -Math.PI / 2 + i * Math.PI / 5;
          const r = i % 2 ? 11 : 24;
          return `${i ? 'L' : 'M'} ${x + Math.cos(angle) * r} ${120 + Math.sin(angle) * r}`;
        }).join(' ');
        path(`${points} Z`, true);
      }
      smile(); break;
    default:
      eyes(); laugh();
      path('M 110 160 L 126 161 L 124 176 L 110 175 Z M 135 161 L 150 160 L 149 175 L 135 176 Z', true, '#fffaf1');
  }
  ctx.restore();
}

export function ballCanvas(tier) {
  if (canvases.has(tier)) return canvases.get(tier);
  const palette = appearance(tier);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(86, 67, 7, 137, 137, 155);
  gradient.addColorStop(0, palette.light);
  gradient.addColorStop(0.48, palette.color);
  gradient.addColorStop(1, palette.dark);
  ctx.fillStyle = gradient;
  ctx.beginPath(); ctx.arc(128, 128, 123, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = palette.dark;
  ctx.globalAlpha = 0.15;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.globalAlpha = 1;
  const gloss = ctx.createLinearGradient(60, 40, 118, 93);
  gloss.addColorStop(0, '#ffffffa6');
  gloss.addColorStop(1, '#ffffff00');
  ctx.fillStyle = gloss;
  ctx.beginPath(); ctx.ellipse(85, 65, 39, 20, -0.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff45';
  ctx.beginPath(); ctx.ellipse(193, 186, 6, 15, 0.65, 0, Math.PI * 2); ctx.fill();
  drawFace(ctx, tier);
  canvases.set(tier, canvas);
  return canvas;
}

export function ballImage(tier) {
  if (!images.has(tier)) images.set(tier, ballCanvas(tier).toDataURL());
  return images.get(tier);
}
