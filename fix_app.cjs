const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');
content = content.replace(/  purgeAllFirestoreData,\n/g, '');
fs.writeFileSync('src/App.tsx', content);
