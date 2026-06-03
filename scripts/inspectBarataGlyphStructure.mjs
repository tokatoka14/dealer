import fs from 'fs';
import opentype from 'opentype.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fontPath = path.resolve(__dirname, '../client/public/fonts/barata-94745801996.ttf');
const buffer = fs.readFileSync(fontPath);
const font = opentype.parse(buffer);

console.log('Font loaded.');
console.log('font.glyphs type:', typeof font.glyphs);
console.log('font.glyphs properties:', Object.keys(font.glyphs));
// Some versions store glyphs in font.glyphs.glyphs array
if (Array.isArray(font.glyphs.glyphs)) {
  console.log('glyph count:', font.glyphs.glyphs.length);
  font.glyphs.glyphs.forEach((glyph, idx) => {
    const unicode = glyph.unicode ? `U+${glyph.unicode.toString(16).toUpperCase()}` : 'none';
    console.log(`${idx}: name='${glyph.name}', unicode=${unicode}`);
  });
} else if (Array.isArray(font.glyphs)) {
  console.log('glyph count:', font.glyphs.length);
  font.glyphs.forEach((glyph, idx) => {
    const unicode = glyph.unicode ? `U+${glyph.unicode.toString(16).toUpperCase()}` : 'none';
    console.log(`${idx}: name='${glyph.name}', unicode=${unicode}`);
  });
} else {
  console.log('Unexpected glyphs structure');
}
