const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /if \(updatedCouple\) \{\s*setCouple\(updatedCouple\);\s*saveCouple\(updatedCouple\);\s*\} else \{\s*\/\/\s*Couple room deleted or doesn't exist\s*setCouple\(null as any\);\s*saveCouple\(null as any\);\s*\}/;

const repl = `if (updatedCouple) {
        setCouple(updatedCouple);
        saveCouple(updatedCouple);
      } else {
        console.warn('[App] subscribeToCouple returned null. Ignoring to prevent accidental logout on iOS.');
      }`;

if (regex.test(code)) {
  code = code.replace(regex, repl);
  fs.writeFileSync('src/App.tsx', code);
  console.log('Fixed subscribeToCouple in App.tsx');
} else {
  console.log('Regex did not match.');
}
