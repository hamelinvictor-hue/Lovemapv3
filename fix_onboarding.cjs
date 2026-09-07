const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /if \(partnerId === 'partner_a' \|\| !syncedCouple\) \{\s*setShowDuoCodeModal\(codeToShow\);\s*\}/;
const repl = `if (partnerId === 'partner_a' || !syncedCouple) {
        ensureCoupleRoomInFirestore(codeToShow, syncedCouple || couple, partnerId || activePartnerId).catch(console.error);
        setShowDuoCodeModal(codeToShow);
      }`;

if (code.match(regex)) {
  code = code.replace(regex, repl);
  fs.writeFileSync('src/App.tsx', code);
  console.log('Fixed handleCompleteOnboarding');
} else {
  console.log('Regex not found');
}
