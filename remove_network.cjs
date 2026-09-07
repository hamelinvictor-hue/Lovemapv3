const fs = require('fs');
let code = fs.readFileSync('src/lib/firebase.ts', 'utf8');

const networkBlockRegex = /if \(typeof window !== 'undefined'\) \{\s*window\.addEventListener\('native-app-resume'[\s\S]*?try \{ await enableNetwork\(db\); \} catch \(e\) \{\}\s*\}\s*\}\);\s*\}/;

if (networkBlockRegex.test(code)) {
  code = code.replace(networkBlockRegex, '');
  code = code.replace(/enableNetwork,\s*disableNetwork,/, '');
  fs.writeFileSync('src/lib/firebase.ts', code);
  console.log('Removed network enable/disable block.');
} else {
  console.log('Could not find network enable/disable block.');
}
