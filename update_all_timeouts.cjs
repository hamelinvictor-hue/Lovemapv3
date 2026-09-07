const fs = require('fs');
let content = fs.readFileSync('src/lib/firebase.ts', 'utf8');

content = content.replace(/withTimeout\(getDocs\(collection\(db, 'couples', targetCode, 'spots'\)\), 3000, null\)/g, "withTimeout(getDocs(collection(db, 'couples', targetCode, 'spots')), 10000, null)");
content = content.replace(/withTimeout\(getDocs\(collection\(db, 'couples', targetCode, 'notifications'\)\), 3000, null\)/g, "withTimeout(getDocs(collection(db, 'couples', targetCode, 'notifications')), 10000, null)");

content = content.replace(/withTimeout\(getDocs\(spotsRef\), 3000, null\)/g, "withTimeout(getDocs(spotsRef), 10000, null)");
content = content.replace(/withTimeout\(getDocs\(notifsRef\), 3000, null\)/g, "withTimeout(getDocs(notifsRef), 10000, null)");

fs.writeFileSync('src/lib/firebase.ts', content);
console.log('Updated all fetch timeouts');
