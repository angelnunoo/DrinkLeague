const fs = require("fs");
const zlib = require("zlib");

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function png(size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const rows = [];
  for (let y = 0; y < size; y++) {
    const r = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x++) {
      const dx = x - size / 2;
      const dy = y - size / 2;
      const d = Math.sqrt(dx * dx + dy * dy);
      const i = 1 + x * 3;
      if (d < size * 0.28) {
        r[i] = 240;
        r[i + 1] = 162;
        r[i + 2] = 2;
      } else if (y > size * 0.55 && y < size * 0.82 && x > size * 0.36 && x < size * 0.64) {
        r[i] = 45;
        r[i + 1] = 212;
        r[i + 2] = 191;
      } else {
        r[i] = 11;
        r[i + 1] = 21;
        r[i + 2] = 18;
      }
    }
    rows.push(r);
  }
  const compressed = zlib.deflateSync(Buffer.concat(rows));
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

fs.writeFileSync("public/icon-192.png", png(192));
fs.writeFileSync("public/icon-512.png", png(512));
console.log("icons ok");
