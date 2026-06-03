import fs from 'fs';
import opentype from 'opentype.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fontPath = path.resolve(__dirname, '../client/public/fonts/barata-94745801996.ttf');
const buffer = fs.readFileSync(fontPath);
const font = opentype.parse(buffer);

// The cmap table contains mappings from character codes to glyph indices
const cmap = font.tables && font.tables.cmap;
if (!cmap) {
  console.log('No cmap table found');
  process.exit(0);
}

console.log('CMap format:', cmap.version);
// glyphIndexMap maps code (number) to glyph index
const map = cmap.glyphIndexMap;
const entries = Object.entries(map).map(([code, glyphIndex]) => ({
  code: Number(code),
  char: String.fromCharCode(Number(code)),
  glyphIndex,
}));
// Sort by code
entries.sort((a, b) => a.code - b.code);

console.log('Total mappings:', entries.length);
entries.slice(0, 200).forEach(entry => {
  console.log(`U+${entry.code.toString(16).toUpperCase().padStart(4, '0')} '${entry.char}' -> glyphIndex ${entry.glyphIndex}`);
});

// Find mappings for Georgian Unicode range (U+10A0–U+10FF)
const georgianRange = entries.filter(e => e.code >= 0x10A0 && e.code <= 0x10FF);
if (georgianRange.length) {
  console.log('\nGeorgian Unicode mappings found:');
  georgianRange.forEach(e => console.log(`U+${e.code.toString(16).toUpperCase()} '${e.char}' -> glyph ${e.glyphIndex}`));
} else {
  console.log('\nNo Georgian Unicode mappings. Likely the font uses Latin codepoints.');
}

// Show Latin codepoints that map to glyphs with names that may hint at Georgian letters
if (font.glyphs && Array.isArray(font.glyphs.glyphs)) {
  const glyphs = font.glyphs.glyphs;
  entries.forEach(e => {
    const glyph = glyphs[e.glyphIndex];
    if (glyph && glyph.name && /uni10/.test(glyph.name)) {
      console.log(`Potential Georgian glyph: code U+${e.code.toString(16).toUpperCase()} -> ${glyph.name}`);
    }
  });
}
