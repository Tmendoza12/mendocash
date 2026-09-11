import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function makeIcon(size) {
  const bg = [0x0b, 0x13, 0x2b]; // navy #0B132B
  const teal = [0x5b, 0xc0, 0xbe]; // #5BC0BE
  const mint = [0x6f, 0xff, 0xe9]; // #6FFFE9
  const rgba = Buffer.alloc(size * size * 4);

  // Fondo con esquinas redondeadas
  const radius = Math.floor(size * 0.2);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = Math.max(radius - x, x - (size - 1 - radius));
      const cy = Math.max(radius - y, y - (size - 1 - radius));
      const dist = Math.sqrt(Math.max(cx, 0) ** 2 + Math.max(cy, 0) ** 2);
      const idx = (y * size + x) * 4;
      if (dist <= radius) {
        rgba[idx] = bg[0]; rgba[idx + 1] = bg[1]; rgba[idx + 2] = bg[2]; rgba[idx + 3] = 255;
      } else {
        rgba[idx + 3] = 0;
      }
    }
  }

  // Letra "M" en bloques (5x7)
  const m = [
    [1, 0, 0, 0, 1],
    [1, 1, 0, 1, 1],
    [1, 0, 1, 0, 1],
    [1, 0, 1, 0, 1],
    [1, 0, 1, 0, 1],
    [1, 0, 1, 0, 1],
    [1, 0, 1, 0, 1],
  ];
  const cell = Math.floor(size / 12);
  const mWidth = 5 * cell;
  const mHeight = 7 * cell;
  const offX = Math.floor((size - mWidth) / 2);
  const offY = Math.floor((size - mHeight) / 2);
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 5; c++) {
      if (!m[r][c]) continue;
      for (let dy = 0; dy < cell; dy++) {
        for (let dx = 0; dx < cell; dx++) {
          const x = offX + c * cell + dx;
          const y = offY + r * cell + dy;
          if (x < 0 || y < 0 || x >= size || y >= size) continue;
          const idx = (y * size + x) * 4;
          if (rgba[idx + 3] === 0) continue;
          const useTeal = (x + y) % (cell * 2) < cell;
          const col = useTeal ? teal : mint;
          rgba[idx] = col[0]; rgba[idx + 1] = col[1]; rgba[idx + 2] = col[2];
        }
      }
    }
  }

  return encodePNG(size, size, rgba);
}

writeFileSync(join(outDir, 'icon-192.png'), makeIcon(192));
writeFileSync(join(outDir, 'icon-512.png'), makeIcon(512));
console.log('Iconos generados: icon-192.png, icon-512.png');
