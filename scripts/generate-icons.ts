import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([len, typeAndData, crc]);
}

function generatePng(size: number): Buffer {
  const width = size;
  const height = size;

  // IHDR: width(4), height(4), bit depth(1), color type(1, 6=RGBA), comp(1), filter(1), interlace(1)
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8 bits per channel
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  const ihdr = makeChunk('IHDR', ihdrData);

  // Raw image data: height rows, each starting with filter byte 0
  const rowBytes = 1 + width * 4;
  const rawData = Buffer.alloc(height * rowBytes);

  // Background teal color: #0d9488 -> R: 13, G: 148, B: 136
  const bgR = 13;
  const bgG = 148;
  const bgB = 136;

  // Inner accent color: #14b8a6 -> R: 20, G: 184, B: 166
  const accentR = 20;
  const accentG = 184;
  const accentB = 166;

  // Draw rounded icon
  const radius = size * 0.22;
  const center = size / 2;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowBytes;
    rawData[rowOffset] = 0; // Filter byte: None

    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;

      // Distance from corners for rounded rectangle
      const dx = Math.max(0, Math.abs(x - center + 0.5) - (center - radius));
      const dy = Math.max(0, Math.abs(y - center + 0.5) - (center - radius));
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > radius) {
        // Outside rounded corners: Transparent
        rawData[pixelOffset] = 0;
        rawData[pixelOffset + 1] = 0;
        rawData[pixelOffset + 2] = 0;
        rawData[pixelOffset + 3] = 0;
      } else {
        // Inside icon: Teal gradient
        const factor = y / height;
        const r = Math.round(bgR + (accentR - bgR) * (1 - factor));
        const g = Math.round(bgG + (accentG - bgG) * (1 - factor));
        const b = Math.round(bgB + (accentB - bgB) * (1 - factor));

        // Subtle lighter central emblem
        const fromCenter = Math.hypot(x - center, y - center);
        if (fromCenter < size * 0.28 && fromCenter > size * 0.22) {
          // Inner ring
          rawData[pixelOffset] = 255;
          rawData[pixelOffset + 1] = 255;
          rawData[pixelOffset + 2] = 255;
          rawData[pixelOffset + 3] = 220;
        } else if (fromCenter < size * 0.16) {
          // Center core
          rawData[pixelOffset] = 255;
          rawData[pixelOffset + 1] = 255;
          rawData[pixelOffset + 2] = 255;
          rawData[pixelOffset + 3] = 240;
        } else {
          rawData[pixelOffset] = r;
          rawData[pixelOffset + 1] = g;
          rawData[pixelOffset + 2] = b;
          rawData[pixelOffset + 3] = 255;
        }
      }
    }
  }

  const compressedData = deflateSync(rawData);
  const idat = makeChunk('IDAT', compressedData);
  const iend = makeChunk('IEND', Buffer.alloc(0));

  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([pngHeader, ihdr, idat, iend]);
}

const iconsDir = join(process.cwd(), 'src-tauri', 'icons');
mkdirSync(iconsDir, { recursive: true });

const sizes = [
  { name: '32x32.png', size: 32 },
  { name: '128x128.png', size: 128 },
  { name: '128x128@2x.png', size: 256 },
  { name: 'icon.png', size: 512 },
];

for (const { name, size } of sizes) {
  const buf = generatePng(size);
  writeFileSync(join(iconsDir, name), buf);
  console.log(`Generated: src-tauri/icons/${name} (${size}x${size})`);
}

// Generate icon.ico (using 32x32 PNG)
const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0); // reserved
icoHeader.writeUInt16LE(1, 2); // icon type
icoHeader.writeUInt16LE(1, 4); // 1 image

const png32 = generatePng(32);
const icoEntry = Buffer.alloc(16);
icoEntry[0] = 32; // width
icoEntry[1] = 32; // height
icoEntry[2] = 0;  // colors
icoEntry[3] = 0;  // reserved
icoEntry.writeUInt16LE(1, 4); // color planes
icoEntry.writeUInt16LE(32, 6); // bit depth
icoEntry.writeUInt32LE(png32.length, 8); // size
icoEntry.writeUInt32LE(22, 12); // offset (6 + 16 = 22)

writeFileSync(join(iconsDir, 'icon.ico'), Buffer.concat([icoHeader, icoEntry, png32]));
writeFileSync(join(iconsDir, 'icon.icns'), generatePng(512));
console.log('Generated: icon.ico & icon.icns');
