import fs from 'fs';
import opentype from 'opentype.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fontPath = path.resolve(__dirname, '../client/public/fonts/barata-94745801996.ttf');
const buffer = fs.readFileSync(fontPath);
const font = opentype.parse(buffer);

// Access glyph array
const glyphArray = font.glyphs && Array.isArray(font.glyphs.glyphs) ? font.glyphs.glyphs : [];
console.log('Glyph array length:', glyphArray.length);

// Print first 30 glyph names with their unicode (if any)
for (let i = 0; i < Math.min(30, glyphArray.length); i++) {
  const g = glyphArray[i];
  const code = g.unicode !== undefined ? `U+${g.unicode.toString(16).toUpperCase()}` : '---';
  console.log(`${i}: name='${g.name}', code=${code}, index=${g.index}`);
}

// Show mapping of latin letters a-z to glyph indices (from cmap earlier) together with glyph names
const cmap = font.tables && font.tables.cmap;
if (cmap && cmap.glyphIndexMap) {
  const map = cmap.glyphIndexMap;
  console.log('\nLatin to glyph name mapping:');
  for (const [codeStr, glyphIdx] of Object.entries(map)) {
    const code = Number(codeStr);
    const ch = String.fromCharCode(code);
    if (/[a-zA-Z]/.test(ch)) {
      const glyph = glyphArray[glyphIdx];
      const name = glyph ? glyph.name : 'unknown';
      console.log(`'${ch}' (U+${code.toString(16).toUpperCase()}) -> glyphIdx ${glyphIdx}, name='${name}'`);
    }
  }
}
