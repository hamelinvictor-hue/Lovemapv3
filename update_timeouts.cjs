const fs = require('fs');
let content = fs.readFileSync('src/lib/firebase.ts', 'utf8');

content = content.replace(/withTimeout\(getDoc\(doc\(db, 'couples', cand\)\), 2000, null\)/g, "withTimeout(getDoc(doc(db, 'couples', cand)), 10000, null)");
content = content.replace(/withTimeout\(getDocs\(q\), 3000, null\)/g, "withTimeout(getDocs(q), 10000, null)");

fs.writeFileSync('src/lib/firebase.ts', content);
console.log('Updated timeouts');
