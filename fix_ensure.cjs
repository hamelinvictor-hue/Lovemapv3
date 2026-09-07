const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /restGetDoc\(\`couples\/\$\{couple\.code\}\`\)\.then\(\(remote\) => \{/;
const repl = `// Ensure it exists in Firestore if it was only created locally
        ensureCoupleRoomInFirestore(couple.code, couple, activePartnerId).catch(console.warn);

        restGetDoc(\`couples/\${couple.code}\`).then((remote) => {`;

if (code.match(regex)) {
  code = code.replace(regex, repl);
  fs.writeFileSync('src/App.tsx', code);
  console.log('Fixed ensure');
} else {
  console.log('Regex not found');
}
