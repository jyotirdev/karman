// Assembles the single-file app, index.html, from src/ and assets/. No dependencies: run it with plain Node.
//   node tools/build.js
// The scripts in src/app are joined in name order inside one function, the style sheet is inlined, and the
// map data in assets/ is embedded, so the result is one file that runs from anywhere, including file://.
const fs = require('fs'), path = require('path');
const R = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const B64 = p => fs.readFileSync(path.join(__dirname, '..', p)).toString('base64');
const parts = fs.readdirSync(path.join(__dirname, '../src/app')).filter(f => f.endsWith('.js')).sort();
let js = parts.map(f => R('src/app/' + f)).join('\n');
/* a copy without the embedded data, small enough to syntax-check quickly: node --check .build/app.check.js */
fs.mkdirSync(path.join(__dirname, '../.build'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '../.build/app.check.js'), '(function(){\n' + js + '\n})();');
js = js.replace('__SURF__', B64('assets/surf.jpg')).replace('__LIGHTS__', B64('assets/lights.jpg'))
  .replace('__LAND__', R('assets/land.b64').trim()).replace('__BORDERS__', R('assets/borders.b64').trim()).replace('__PLATES__', R('assets/plates.b64').trim()).replace('__COUNTRIES__', R('assets/countries.txt').trim()).replace('__STARS__', R('assets/stars.b64').trim());
/* the embedded reference datasets go in as JavaScript literals; "</" is broken up so nothing in them can close the script element */
const lit = p => R(p).trim().replace(/<\//g, '<\\/').replace(/\u2028|\u2029/g, '');
js = js.replace('__CABLES__', () => lit('assets/cables.json')).replace('__NUCLEAR__', () => lit('assets/nuclear.json')).replace('__ENERGY__', () => lit('assets/energy.json'));
const html = R('src/index.html').replace('/*__CSS__*/', () => R('src/style.css')).replace('/*__JS__*/', () => js);
if (/__(SURF|LIGHTS|LAND|BORDERS|PLATES|COUNTRIES|STARS|CABLES|NUCLEAR|ENERGY|CSS|JS)__/.test(html)) throw new Error('unreplaced placeholder');
fs.writeFileSync(path.join(__dirname, '../index.html'), html);
console.log('built index.html,', fs.statSync(path.join(__dirname, '../index.html')).size, 'bytes from', parts.length, 'scripts');
