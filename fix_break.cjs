const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const regex1 = /setCouple\(freshCouple\);\s*saveCouple\(freshCouple\);\s*return;/;
const repl1 = `setCouple(freshCouple);
            saveCouple(freshCouple);
            ensureGuestUser().then(user => {
              createCoupleInFirestore(user, freshCouple.partnerA.name, freshCouple.partnerA.avatar).catch(console.error);
            });
            return;`;

if (code.match(regex1)) {
  code = code.replace(regex1, repl1);
  console.log('Fixed regex1');
} else {
  console.log('Regex1 not found');
}

const regex2 = /if \(auth\.currentUser\) \{\s*createCoupleInFirestore\(auth\.currentUser, breakerName, freshCouple\.partnerA\.avatar\)\.catch\(console\.error\);\s*\}/;
const repl2 = `ensureGuestUser().then(user => {
      createCoupleInFirestore(user, breakerName, freshCouple.partnerA.avatar).catch(console.error);
    });`;

if (code.match(regex2)) {
  code = code.replace(regex2, repl2);
  console.log('Fixed regex2');
} else {
  console.log('Regex2 not found');
}

fs.writeFileSync('src/App.tsx', code);
