const fs = require('fs');

const files = [
  'src/components/DuoView.tsx',
  'src/components/DuoCodeModal.tsx',
  'src/components/CoupleSettingsModal.tsx'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  
  if (!content.includes('copyToClipboard')) {
    // Add import
    content = "import { copyToClipboard } from '../lib/clipboard';\n" + content;
  }

  // Replace navigator.clipboard.writeText
  content = content.replace(/navigator\.clipboard\.writeText\(([^)]+)\)\.catch\(\(\) => \{\}\);/g, "copyToClipboard($1);");
  content = content.replace(/navigator\.clipboard\.writeText\(([^)]+)\);/g, "copyToClipboard($1);");
  
  fs.writeFileSync(file, content);
}
