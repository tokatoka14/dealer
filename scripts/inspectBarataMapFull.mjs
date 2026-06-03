import fs from 'fs';
import opentype from 'opentype.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fontPath = path.resolve(__dirname, '../client/public/fonts/barata-94745801996.ttf');

const buffer = fs.readFileSync(fontPath);
// Use the newer parse method as suggested by the warning
const font = opentype.parse(buffer);

console.log('Font loaded. Number of glyphs:', font.glyphs.length);

font.glyphs.forEach((glyph, idx) => {
  // glyph.unicode may be undefined for non-Unicode fonts
  const unicode = glyph.unicode ? `U+${glyph.unicode.toString(16).toUpperCase()}` : 'none';
  console.log(`${idx}: name='${glyph.name}', unicode=${unicode}, advanceWidth=${glyph.advanceWidth}`);
});

// Identify glyphs that correspond to Georgian calligraphy by looking for typical Georgian glyph names if present
console.log('\n--- Glyphs with names containing "georgian" or similar ---');
font.glyphs.forEach((glyph, idx) => {
  if (/georgian|geo|uni10|uni1[0-9A-F]{2}/i.test(glyph.name)) {
    console.log(`${idx}: name='${glyph.name}'`);
  }
});
