const fs = require('fs');

const files = [
  'src/components/DuoView.tsx',
  'src/components/DuoCodeModal.tsx',
  'src/components/CoupleSettingsModal.tsx'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/navigator\.clipboard\.writeText\(([^)]+)\);/g, "navigator.clipboard.writeText($1).catch(() => {});");
  fs.writeFileSync(file, content);
}
