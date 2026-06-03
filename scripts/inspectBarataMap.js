const opentype = require('opentype.js');
const path = require('path');

const fontPath = path.resolve(__dirname, '../client/public/fonts/barata-94745801996.ttf');

opentype.load(fontPath, (err, font) => {
  if (err) {
    console.error('Failed to load font:', err);
    return;
  }
  const map = {};
  // iterate over glyphs with unicode values
  font.glyphs.forEach(g => {
    if (g.unicode) {
      const char = String.fromCharCode(g.unicode);
      map[char] = g.name;
    }
  });
  // Georgian characters we care about
  const georgian = ['ა','ბ','გ','დ','ე','ვ','ზ','თ','ი','კ','ლ','მ','ნ','ო','პ','ჟ','რ','ს','ტ','უ','ფ','ქ','ღ','ყ','შ','ჩ','ც','ძ','წ','ჭ','ხ','ჯ','ჰ'];
  console.log('--- Mapping for Georgian chars ---');
  georgian.forEach(ch => {
    const latin = Object.entries(map).find(([, name]) => name && name.includes('uni10D0'));
    // Instead, simply output the unicode code point and the glyph name if exists
    const entry = map[ch];
    if (entry) {
      console.log(`${ch} -> glyph name: ${entry}`);
    } else {
      console.log(`${ch} -> no direct unicode mapping`);
    }
  });
  // Show the full map for Latin keys that have a glyph (to find which latin char renders Georgian glyph)
  console.log('\n--- Full map of characters with glyph names (sample) ---');
  const entries = Object.entries(map).slice(0, 200);
  entries.forEach(([char, name]) => {
    console.log(`${char} (U+${char.codePointAt(0).toString(16).toUpperCase()}): ${name}`);
  });
});
