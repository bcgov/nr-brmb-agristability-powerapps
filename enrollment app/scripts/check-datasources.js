const { readFileSync } = require('fs');
const js = readFileSync('.power/schemas/appschemas/dataSourcesInfo.js', 'utf8');
const ts = readFileSync('.power/schemas/appschemas/dataSourcesInfo.ts', 'utf8');
const keys = s => [...s.matchAll(/^  "([^"]+)":\s*\{/gm)].map(m => m[1]).sort();
const jsKeys = keys(js), tsKeys = keys(ts);
const onlyInTs = tsKeys.filter(k => !jsKeys.includes(k));
const onlyInJs = jsKeys.filter(k => !tsKeys.includes(k));
if (onlyInTs.length || onlyInJs.length) {
  console.log('MISMATCH');
  if (onlyInTs.length) console.log('In .ts only:', onlyInTs);
  if (onlyInJs.length) console.log('In .js only:', onlyInJs);
  process.exit(1);
} else {
  console.log('dataSourcesInfo.js and .ts are in sync');
}
