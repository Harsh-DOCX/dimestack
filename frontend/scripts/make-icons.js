const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const i = row + 1 + x * 4;
      const nx = x / size;
      const ny = y / size;
      const inside = nx > 0.08 && nx < 0.92 && ny > 0.08 && ny < 0.92;
      const stem = nx > 0.28 && nx < 0.40 && ny > 0.24 && ny < 0.76;
      const bowl = nx > 0.36 && nx < 0.68 && ny > 0.24 && ny < 0.76 && ((nx - 0.5) ** 2) / 0.05 + ((ny - 0.5) ** 2) / 0.07 < 1;
      const hole = nx > 0.42 && nx < 0.60 && ny > 0.36 && ny < 0.64 && ((nx - 0.5) ** 2) / 0.02 + ((ny - 0.5) ** 2) / 0.03 < 1;
      const dot = (nx - 0.72) ** 2 + (ny - 0.28) ** 2 < 0.004;
      let color = [0, 0, 0, 0];
      if (inside) color = [14, 14, 14, 255];
      if ((stem || bowl) && !hole) color = [20, 184, 166, 255];
      if (dot) color = [20, 184, 166, 255];
      raw[i] = color[0];
      raw[i + 1] = color[1];
      raw[i + 2] = color[2];
      raw[i + 3] = color[3];
    }
  }
  const idat = zlib.deflateSync(raw);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

function ico(pngBuffer, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size;
  entry[1] = size >= 256 ? 0 : size;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngBuffer.length, 8);
  entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, pngBuffer]);
}

const out = path.join(__dirname, '..', 'public');
const png192 = png(192);
const png32 = png(32);
fs.writeFileSync(path.join(out, 'icon-192.png'), png192);
fs.writeFileSync(path.join(out, 'icon-512.png'), png(512));
fs.writeFileSync(path.join(out, 'favicon.ico'), ico(png32, 32));
console.log('icons written');
