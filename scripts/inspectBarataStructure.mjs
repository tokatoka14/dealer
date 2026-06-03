import fs from 'fs';
import opentype from 'opentype.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fontPath = path.resolve(__dirname, '../client/public/fonts/barata-94745801996.ttf');
const buffer = fs.readFileSync(fontPath);
const font = opentype.parse(buffer);

console.log('font.glyphs type:', typeof font.glyphs);
console.log('font.glyphs keys:', Object.keys(font.glyphs));
if (Array.isArray(font.glyphs)) {
  console.log('glyphs array length:', font.glyphs.length);
} else if (Array.isArray(font.glyphs.glyphs)) {
  console.log('glyphs.glyphs length:', font.glyphs.glyphs.length);
} else if (Array.isArray(font.glyphs.glyphs?.glyphs)) {
  console.log('glyphs.glyphs.glyphs length:', font.glyphs.glyphs.glyphs.length);
} else {
  console.log('No recognizable glyph array');
}
