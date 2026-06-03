import opentype from 'opentype.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fontPath = path.resolve(__dirname, '../client/public/fonts/barata-94745801996.ttf');

opentype.load(fontPath, (err, font) => {
  if (err) {
    console.error('Failed to load font:', err);
    return;
  }
  const map = {};
  font.glyphs.forEach(g => {
    if (g.unicode) {
      const char = String.fromCharCode(g.unicode);
      map[char] = g.name;
    }
  });
  console.log('--- Full character map (sample first 200 entries) ---');
  const entries = Object.entries(map).slice(0, 200);
  entries.forEach(([char, name]) => {
    console.log(`${char} (U+${char.codePointAt(0).toString(16).toUpperCase()}): ${name}`);
  });
  // Also list any Latin characters that map to glyph names containing 'Georgian' or similar keywords
  console.log('\n--- Potential Georgian glyphs (searching name for "uni10" or similar) ---');
  Object.entries(map).forEach(([char, name]) => {
    if (name && /uni10[0-9A-F]{2}/i.test(name)) {
      console.log(`${char} -> ${name}`);
    }
  });
});
