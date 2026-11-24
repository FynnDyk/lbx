import * as THREE from 'three';
import { ArenaId } from './types';

export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    4,
    size / 2,
    size / 2,
    size / 2,
  );
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.25)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createCarbonFrameTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = '#111827';
  for (let y = 0; y < size; y += 8) {
    for (let x = 0; x < size; x += 8) {
      if (((x + y) / 8) % 2 === 0) {
        ctx.fillRect(x, y, 4, 4);
      } else {
        ctx.fillRect(x + 4, y + 4, 4, 4);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createArmorDetailTexture(baseHex: string): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);

  // Subtle mechanical panel seams and micro rivets
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.lineWidth = 2;
  ctx.strokeRect(12, 12, size - 24, size - 24);
  ctx.beginPath();
  ctx.moveTo(12, size / 2);
  ctx.lineTo(size - 12, size / 2);
  ctx.moveTo(size / 2, 12);
  ctx.lineTo(size / 2, size - 12);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(16, 16, size - 32, size - 32);

  // Rivet dots
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  [24, size - 24].forEach((px) => {
    [24, size - 24].forEach((py) => {
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createArenaFloorTexture(
  arenaId: ArenaId,
  primaryHex: string,
  secondaryHex: string,
  accentHex: string,
  maxAnisotropy: number,
  arenaRadius = 19.5,
): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = primaryHex;
  ctx.fillRect(0, 0, size, size);

  if (arenaId === 'meadow') {
    const mSize = 2048;
    canvas.width = mSize;
    canvas.height = mSize;

    // Deep, lush saturated meadow grass gradient (no pale lime washout)
    const grad = ctx.createRadialGradient(
      mSize / 2,
      mSize / 2,
      70,
      mSize / 2,
      mSize / 2,
      mSize * 0.56,
    );
    grad.addColorStop(0, '#368a29');
    grad.addColorStop(0.56, primaryHex);
    grad.addColorStop(0.9, '#24641c');
    grad.addColorStop(1, '#215c19');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, mSize, mSize);

    let seed = 1337;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    // Multi-scale organic soil, deep moss, and sunlit chlorophyll turf patches
    for (let i = 0; i < 4200; i++) {
      const gx = rand() * mSize;
      const gy = rand() * mSize;
      const r = 8 + rand() * 38;
      const mod = i % 5;
      ctx.fillStyle =
        mod === 0
          ? 'rgba(20, 58, 16, 0.16)'
          : mod === 1
            ? 'rgba(58, 148, 40, 0.15)'
            : mod === 2
              ? 'rgba(32, 92, 24, 0.14)'
              : mod === 3
                ? 'rgba(74, 168, 46, 0.1)'
                : 'rgba(64, 52, 32, 0.06)';
      ctx.beginPath();
      ctx.ellipse(gx, gy, r, r * (0.6 + rand() * 0.6), rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    // Fine soil micro-speckles & clover flecks for photorealistic ground grain
    for (let i = 0; i < 6500; i++) {
      const sx = rand() * mSize;
      const sy = rand() * mSize;
      const sr = 0.8 + rand() * 2.2;
      ctx.fillStyle =
        i % 3 === 0
          ? 'rgba(14, 42, 12, 0.28)'
          : i % 3 === 1
            ? 'rgba(84, 178, 52, 0.22)'
            : 'rgba(54, 44, 24, 0.14)';
      ctx.fillRect(sx, sy, sr, sr);
    }

    // Dense curved individual grass blades layered across the arena floor
    const bladePalette = [
      'rgba(18, 54, 14, 0.65)',
      'rgba(28, 82, 21, 0.68)',
      'rgba(44, 118, 32, 0.72)',
      'rgba(62, 148, 40, 0.65)',
      'rgba(82, 174, 48, 0.52)',
    ];
    ctx.lineCap = 'round';
    for (let i = 0; i < 24000; i++) {
      const bx = rand() * mSize;
      const by = rand() * mSize;
      const len = 5 + rand() * 11;
      const lean = (rand() - 0.5) * 7.5;
      const curve = (rand() - 0.5) * 4.5;
      ctx.strokeStyle = bladePalette[i % bladePalette.length];
      ctx.lineWidth = 0.9 + rand() * 1.1;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + curve, by - len * 0.55, bx + lean, by - len);
      ctx.stroke();
    }

    // 1:1 world (x, z) -> canvas (cx, cy) mapping for the full arena diameter
    const diameter = arenaRadius * 2;
    const toPx = (wx: number, wz: number): [number, number] => [
      (0.5 + wx / diameter) * mSize,
      (0.5 + wz / diameter) * mSize,
    ];
    const pxScale = mSize / size;

    // Winding natural earthen footpath through south-east / right side
    const [p1x, p1y] = toPx(2.5, 48.0);
    const [p2x, p2y] = toPx(13.0, 28.5);
    const [p3x, p3y] = toPx(25.0, 13.5);
    const [p4x, p4y] = toPx(47.0, 17.5);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(118, 88, 48, 0.48)';
    ctx.lineWidth = 34 * pxScale;
    ctx.beginPath();
    ctx.moveTo(p1x, p1y);
    ctx.quadraticCurveTo(p2x, p2y, p3x, p3y);
    ctx.quadraticCurveTo((p3x + p4x) * 0.52, p3y + 18 * pxScale, p4x, p4y);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(176, 146, 94, 0.62)';
    ctx.lineWidth = 20 * pxScale;
    ctx.beginPath();
    ctx.moveTo(p1x, p1y);
    ctx.quadraticCurveTo(p2x, p2y, p3x, p3y);
    ctx.quadraticCurveTo((p3x + p4x) * 0.52, p3y + 18 * pxScale, p4x, p4y);
    ctx.stroke();

    // Branch path leading toward the central-left ruin courtyard
    const [b1x, b1y] = toPx(-4.5, 5.5);
    const [b2x, b2y] = toPx(5.5, 21.0);
    ctx.strokeStyle = 'rgba(166, 136, 86, 0.48)';
    ctx.lineWidth = 15 * pxScale;
    ctx.beginPath();
    ctx.moveTo(b1x, b1y);
    ctx.quadraticCurveTo(b2x, b2y, p2x, p2y);
    ctx.stroke();

    // Fine pebble grain along footpaths
    for (let i = 0; i < 650; i++) {
      const tP = rand();
      const px = THREE.MathUtils.lerp(p1x, p4x, tP) + (rand() - 0.5) * 44;
      const py = THREE.MathUtils.lerp(p1y, p3y, Math.sin(tP * Math.PI * 0.7)) + (rand() - 0.5) * 44;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(92, 70, 42, 0.22)' : 'rgba(210, 186, 136, 0.18)';
      ctx.fillRect(px, py, 2 + rand() * 3, 2 + rand() * 3);
    }

    // Mossy stone ruin courtyard paving under central-left shrine & L-walls
    const [rx, ry] = toPx(-9.8, -1.6);
    ctx.fillStyle = 'rgba(98, 108, 94, 0.42)';
    ctx.beginPath();
    ctx.ellipse(rx, ry, mSize * 0.068, mSize * 0.072, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(138, 146, 132, 0.34)';
    for (let sx = -3; sx <= 3; sx++) {
      for (let sy = -3; sy <= 3; sy++) {
        if (Math.abs(sx) + Math.abs(sy) > 4) continue;
        ctx.fillRect(
          rx + sx * 13 * pxScale - 4.5 * pxScale,
          ry + sy * 13 * pxScale - 4.5 * pxScale,
          9 * pxScale,
          9 * pxScale,
        );
      }
    }

    // Subtle earthen/mossy base skirts under all cliff clusters & boulders
    [
      [-18.0, 16.5, 42],
      [-13.6, 15.0, 30],
      [18.0, -16.5, 44],
      [13.5, -15.0, 30],
      [-29.0, -22.0, 42],
      [29.0, 21.5, 42],
      [-36.5, 5.5, 38],
      [36.0, -4.5, 38],
      [-5.5, -36.5, 36],
      [5.5, 36.5, 36],
      [-33.0, 28.0, 24],
      [33.0, -28.0, 24],
      [18.0, 33.5, 26],
      [-18.0, -33.5, 26],
    ].forEach(([mx, mz, rad]) => {
      const [cx, cy] = toPx(mx, mz);
      const rPx = rad * pxScale;
      const sg = ctx.createRadialGradient(cx, cy, rPx * 0.25, cx, cy, rPx);
      sg.addColorStop(0, 'rgba(48, 62, 34, 0.62)');
      sg.addColorStop(0.65, 'rgba(34, 78, 26, 0.28)');
      sg.addColorStop(1, 'rgba(34, 78, 26, 0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (arenaId === 'cardboard') {
    ctx.strokeStyle = 'rgba(72, 46, 22, 0.14)';
    ctx.lineWidth = 2;
    for (let y = 0; y < size; y += 8) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(60, 36, 15, 0.3)';
    ctx.lineWidth = 3;
    const step = 128;
    for (let i = 0; i <= size; i += step) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(size, i);
      ctx.stroke();
    }
    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = secondaryHex;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.44, 0, Math.PI * 2);
    ctx.stroke();
  } else if (arenaId === 'factory') {
    ctx.fillStyle = secondaryHex;
    for (let y = 0; y < size; y += 256) {
      for (let x = 0; x < size; x += 256) {
        if (((x + y) / 256) % 2 === 0) {
          ctx.fillRect(x, y, 256, 256);
        }
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 4;
    for (let i = 0; i <= size; i += 128) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(size, i);
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(size / 2, size / 2);
    for (let i = 0; i < 36; i++) {
      ctx.rotate((Math.PI * 2) / 36);
      ctx.fillStyle = i % 2 === 0 ? accentHex : '#0f172a';
      ctx.fillRect(size * 0.36, -12, 22, 24);
    }
    ctx.restore();
  } else if (arenaId === 'canyon') {
    for (let i = 0; i < 650; i++) {
      const rx = Math.random() * size;
      const ry = Math.random() * size;
      const rw = 20 + Math.random() * 80;
      ctx.fillStyle =
        i % 2 === 0 ? 'rgba(255, 210, 160, 0.08)' : 'rgba(65, 25, 10, 0.1)';
      ctx.fillRect(rx, ry, rw, 3);
    }
    ctx.strokeStyle = accentHex;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.25, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = secondaryHex;
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.18)';
    ctx.lineWidth = 2;
    const step = 64;
    for (let i = 0; i <= size; i += step) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(size, i);
      ctx.stroke();
    }
    [0.14, 0.28, 0.43].forEach((r, idx) => {
      ctx.strokeStyle = idx === 1 ? '#F59E0B' : accentHex;
      ctx.lineWidth = idx === 2 ? 12 : 6;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size * r, 0, Math.PI * 2);
      ctx.stroke();
    });
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  return tex;
}

export function createObstacleTexture(
  kind: 'block' | 'pillar' | 'crate' | 'rock' | 'ruin',
  accentHex: string,
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  if (kind === 'block') {
    ctx.fillStyle = '#B88B58';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#7C5329';
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, size - 16, size - 16);
    ctx.fillStyle = accentHex;
    ctx.fillRect(24, 24, size - 48, 22);
    ctx.fillStyle = '#4B3218';
    ctx.fillRect(24, size - 44, size - 48, 12);
  } else if (kind === 'crate') {
    // Detailed wooden/tactical destructible supply crate
    ctx.fillStyle = '#8B5E34';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#4A3018';
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, size - 12, size - 12);
    // Plank lines
    ctx.lineWidth = 4;
    for (let y = 56; y < size; y += 56) {
      ctx.beginPath();
      ctx.moveTo(12, y);
      ctx.lineTo(size - 12, y);
      ctx.stroke();
    }
    // Cross brace + hazard icon
    ctx.strokeStyle = '#603E1E';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(16, 16);
    ctx.lineTo(size - 16, size - 16);
    ctx.stroke();
    ctx.fillStyle = accentHex;
    ctx.fillRect(size / 2 - 22, size / 2 - 22, 44, 44);
  } else if (kind === 'rock') {
    // Stratified anime cliff rock with vertical striations & mossy crevices
    ctx.fillStyle = '#8b8f84';
    ctx.fillRect(0, 0, size, size);
    for (let x = 0; x < size; x += 14) {
      ctx.fillStyle = x % 28 === 0 ? 'rgba(62, 68, 60, 0.34)' : 'rgba(210, 214, 200, 0.24)';
      ctx.fillRect(x, 0, 7, size);
    }
    for (let y = 0; y < size; y += 28) {
      ctx.fillStyle = 'rgba(48, 54, 46, 0.22)';
      ctx.fillRect(0, y, size, 4);
    }
    ctx.fillStyle = 'rgba(42, 118, 30, 0.48)';
    ctx.fillRect(0, 0, size, 20);
  } else if (kind === 'ruin') {
    ctx.fillStyle = '#7c8288';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#47505a';
    ctx.lineWidth = 5;
    for (let row = 0; row < 6; row++) {
      const y = row * 44;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
      const offset = (row % 2) * 32;
      for (let x = offset; x < size; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 44);
        ctx.stroke();
      }
    }
    ctx.fillStyle = 'rgba(44, 122, 34, 0.46)';
    for (let i = 0; i < 28; i++) {
      ctx.fillRect(
        (i * 47) % (size - 24),
        size - 58 + ((i * 23) % 44),
        18 + (i % 18),
        10 + (i % 14),
      );
    }
  } else {
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = accentHex;
    ctx.fillRect(0, size * 0.2, size, 16);
    ctx.fillRect(0, size * 0.75, size, 16);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createGrassDetailTexture(
  maxAnisotropy: number,
  repeatX = 24,
  repeatY = 24,
): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#24611b';
  ctx.fillRect(0, 0, size, size);

  let seed = 8821;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // Seamless wrapping patches
  for (let i = 0; i < 650; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 10 + rand() * 26;
    const col =
      i % 3 === 0
        ? 'rgba(18, 54, 14, 0.22)'
        : i % 3 === 1
          ? 'rgba(54, 138, 36, 0.18)'
          : 'rgba(34, 96, 26, 0.16)';
    ctx.fillStyle = col;
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        if (x + ox < -r || x + ox > size + r || y + oy < -r || y + oy > size + r) continue;
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Seamless realistic grass blades
  const colors = [
    'rgba(16, 48, 12, 0.72)',
    'rgba(28, 84, 20, 0.74)',
    'rgba(44, 124, 30, 0.72)',
    'rgba(62, 152, 40, 0.65)',
    'rgba(82, 174, 48, 0.5)',
  ];
  ctx.lineCap = 'round';
  for (let i = 0; i < 6800; i++) {
    const bx = rand() * size;
    const by = rand() * size;
    const len = 6 + rand() * 12;
    const lean = (rand() - 0.5) * 8;
    const curve = (rand() - 0.5) * 4;
    ctx.strokeStyle = colors[i % colors.length];
    ctx.lineWidth = 1.0 + rand() * 1.1;
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const px = bx + ox;
        const py = by + oy;
        if (px < -16 || px > size + 16 || py < -16 || py > size + 24) continue;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.quadraticCurveTo(px + curve, py - len * 0.55, px + lean, py - len);
        ctx.stroke();
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  return tex;
}

export function createGrassBumpTexture(
  maxAnisotropy: number,
  repeatX = 24,
  repeatY = 24,
): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#686868';
  ctx.fillRect(0, 0, size, size);

  let seed = 5519;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  ctx.lineCap = 'round';
  for (let i = 0; i < 6000; i++) {
    const bx = rand() * size;
    const by = rand() * size;
    const len = 6 + rand() * 11;
    const lean = (rand() - 0.5) * 7.5;
    const lum = i % 3 === 0 ? 45 : i % 3 === 1 ? 165 : 225;
    ctx.strokeStyle = `rgb(${lum}, ${lum}, ${lum})`;
    ctx.lineWidth = 1.0 + rand() * 1.1;
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const px = bx + ox;
        const py = by + oy;
        if (px < -16 || px > size + 16 || py < -16 || py > size + 24) continue;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + lean, py - len);
        ctx.stroke();
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  return tex;
}

export function createCliffWallTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, '#a3a89c');
  grad.addColorStop(0.5, '#7c8276');
  grad.addColorStop(1, '#52584d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Crisp anime vertical cliff facets, crevices, and sunlit rock ridges (Image 2)
  for (let x = 0; x < size; x += 12) {
    const shade =
      x % 48 === 0
        ? 'rgba(34, 40, 34, 0.44)'
        : x % 36 === 0
          ? 'rgba(226, 232, 216, 0.3)'
          : x % 24 === 0
            ? 'rgba(54, 60, 52, 0.32)'
            : 'rgba(176, 182, 168, 0.2)';
    ctx.fillStyle = shade;
    ctx.fillRect(x, 0, 6 + (x % 5), size);
  }
  // Jagged horizontal rock strata seams + mossy ledge veins
  for (let y = 78; y < size; y += 84) {
    ctx.fillStyle = 'rgba(32, 38, 32, 0.35)';
    ctx.fillRect(0, y, size, 7);
    ctx.fillStyle = 'rgba(46, 126, 32, 0.54)';
    ctx.fillRect(0, y - 6, size, 7);
  }
  // Rich deep emerald grass overhang along top edge
  ctx.fillStyle = '#2d7a22';
  ctx.fillRect(0, 0, size, 24);
  for (let x = 0; x < size; x += 14) {
    const drop = 8 + ((x * 7) % 18);
    ctx.fillStyle = x % 28 === 0 ? '#39922b' : '#215f19';
    ctx.fillRect(x, 22, 11, drop);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createAnimeSkyTexture(): THREE.CanvasTexture {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
  skyGrad.addColorStop(0, '#1462c8');
  skyGrad.addColorStop(0.28, '#3897ed');
  skyGrad.addColorStop(0.52, '#85cffb');
  skyGrad.addColorStop(0.64, '#d9f2ff');
  skyGrad.addColorStop(0.75, '#fff4dc');
  skyGrad.addColorStop(1, '#cbeeff');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, width, height);

  // Soft golden sun atmospheric scatter aligned with key sunlight azimuth
  const sunX = width * 0.66;
  const sunY = height * 0.27;
  const corona = ctx.createRadialGradient(sunX, sunY, 6, sunX, sunY, 175);
  corona.addColorStop(0, 'rgba(255, 253, 236, 0.96)');
  corona.addColorStop(0.14, 'rgba(255, 244, 200, 0.68)');
  corona.addColorStop(0.45, 'rgba(255, 224, 150, 0.22)');
  corona.addColorStop(1, 'rgba(255, 220, 140, 0)');
  ctx.fillStyle = corona;
  ctx.fillRect(0, 0, width, height);

  // Soft anime daytime cumulus cloud puffs near horizon & mid-sky with warm sunlit tops
  const drawCloud = (cx: number, cy: number, rx: number, ry: number, alpha: number) => {
    ctx.fillStyle = `rgba(186, 212, 234, ${alpha * 0.45})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy + ry * 0.22, rx * 0.96, ry * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(255, 252, 245, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - rx * 0.45, cy + ry * 0.16, rx * 0.58, ry * 0.72, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + rx * 0.48, cy + ry * 0.12, rx * 0.62, ry * 0.76, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + rx * 0.12, cy - ry * 0.26, rx * 0.55, ry * 0.78, 0, 0, Math.PI * 2);
    ctx.fill();
  };

  const clouds: Array<[number, number, number, number, number]> = [
    [110, 215, 76, 22, 0.78],
    [290, 175, 92, 26, 0.72],
    [480, 228, 108, 24, 0.82],
    [680, 185, 86, 25, 0.76],
    [885, 218, 96, 24, 0.8],
    [195, 252, 68, 16, 0.64],
    [605, 256, 78, 18, 0.68],
    [820, 252, 72, 16, 0.64],
  ];
  clouds.forEach(([x, y, rx, ry, a]) => drawCloud(x, y, rx, ry, a));

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
