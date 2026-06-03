import fs from 'fs';
import opentype from 'opentype.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fontPath = path.resolve(__dirname, '../client/public/fonts/barata-94745801996.ttf');
const buffer = fs.readFileSync(fontPath);
const font = opentype.parse(buffer);

// Determine where the glyph array resides
let glyphArray = [];
if (Array.isArray(font.glyphs)) {
  glyphArray = font.glyphs;
} else if (Array.isArray(font.glyphs.glyphs)) {
  glyphArray = font.glyphs.glyphs;
} else if (Array.isArray(font.glyphs.glyphs?.glyphs)) {
  glyphArray = font.glyphs.glyphs.glyphs;
}

console.log('Detected glyph count:', glyphArray.length);

// Print each glyph's unicode (if any) and name
glyphArray.forEach((g, i) => {
  const unicode = g.unicode ? `U+${g.unicode.toString(16).toUpperCase()}` : 'none';
  console.log(`${i}: name='${g.name}', unicode=${unicode}`);
});
