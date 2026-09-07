const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /ensureSubscriberInRevenueCat\(updatedCouple\.code\);\s*\}\)\s*\.catch\(console\.error\);\s*\}\s*\}, \[couple\.code, isOnboardingOpen\]\);/;
const repl = `ensureSubscriberInRevenueCat(updatedCouple.code);
        })
        .catch(console.error);
    }
  }, [couple.code, isOnboardingOpen, isSettingsOpen, showDuoCodeModal]);`;

if (code.match(regex)) {
  code = code.replace(regex, repl);
  fs.writeFileSync('src/App.tsx', code);
  console.log('Fixed deps');
} else {
  console.log('Regex not found');
}
