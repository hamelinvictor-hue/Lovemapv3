const fs = require('fs');
let code = fs.readFileSync('src/lib/firebase.ts', 'utf8');

const restQueryRepl = `
export async function restFindUserCouple(uid: string, email: string | null): Promise<any | null> {
  try {
    const candidates = [uid, \`apple_\${uid}\`, \`google_\${uid}\`];
    if (email) candidates.push(email);

    for (const cand of candidates) {
      // 1. Try ownerUid
      let res = await fetch(\`\${FIRESTORE_REST_BASE}:runQuery?key=\${firebaseConfig.apiKey}\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: 'couples' }],
            where: {
              fieldFilter: {
                field: { fieldPath: 'ownerUid' },
                op: 'EQUAL',
                value: { stringValue: cand }
              }
            },
            limit: 1
          }
        }),
        cache: 'no-store'
      });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json) && json[0]?.document) {
           return fromFirestoreDoc(json[0].document);
        }
      }

      // 2. Try array-contains memberUids
      res = await fetch(\`\${FIRESTORE_REST_BASE}:runQuery?key=\${firebaseConfig.apiKey}\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: 'couples' }],
            where: {
              fieldFilter: {
                field: { fieldPath: 'memberUids' },
                op: 'ARRAY_CONTAINS',
                value: { stringValue: cand }
              }
            },
            limit: 1
          }
        }),
        cache: 'no-store'
      });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json) && json[0]?.document) {
           return fromFirestoreDoc(json[0].document);
        }
      }
      
      // 3. Try ownerEmail
      res = await fetch(\`\${FIRESTORE_REST_BASE}:runQuery?key=\${firebaseConfig.apiKey}\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: 'couples' }],
            where: {
              fieldFilter: {
                field: { fieldPath: 'ownerEmail' },
                op: 'EQUAL',
                value: { stringValue: cand }
              }
            },
            limit: 1
          }
        }),
        cache: 'no-store'
      });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json) && json[0]?.document) {
           return fromFirestoreDoc(json[0].document);
        }
      }
    }
  } catch (e) {
    return null;
  }
  return null;
}
`;

if (!code.includes('restFindUserCouple')) {
  code = code.replace('export async function findUserCoupleInFirestore', restQueryRepl + '\nexport async function findUserCoupleInFirestore');
  
  // Now modify findUserCoupleInFirestore to use it!
  const repl = `export async function findUserCoupleInFirestore(
  user: User
): Promise<{ couple: CouplePair; partnerId: PartnerId } | null> {
  if (!user || !user.uid) return null;

  try {
    const restDoc = await restFindUserCouple(user.uid, user.email || null);
    if (restDoc) {
      console.log('[SYNC-DEBUG] Found existing couple via REST Query');
      let partnerId: PartnerId = 'partner_a';
      if (restDoc.partnerBUid === user.uid || restDoc.partnerBUid === \`apple_\${user.uid}\` || restDoc.partnerBUid === \`google_\${user.uid}\`) {
         partnerId = 'partner_b';
      }
      return { couple: restDoc as CouplePair, partnerId };
    }
  } catch (e) {
    console.warn('REST find user couple notice:', e);
  }

  // Fallback to SDK...
  try {
    const couplesRef = collection(db, 'couples');`;
    
  code = code.replace(/export async function findUserCoupleInFirestore\([\s\S]*?const couplesRef = collection\(db, 'couples'\);/, repl);
  
  fs.writeFileSync('src/lib/firebase.ts', code);
  console.log('Added REST query fallback');
}
