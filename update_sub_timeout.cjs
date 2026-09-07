const fs = require('fs');
let content = fs.readFileSync('src/lib/firebase.ts', 'utf8');

content = content.replace(/const snap = await withTimeout\(getDoc\(coupleRef\), 3000, null\);/g, "const snap = await withTimeout(getDoc(coupleRef), 10000, null);");

fs.writeFileSync('src/lib/firebase.ts', content);
console.log('Updated sub timeout');
