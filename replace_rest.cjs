const fs = require('fs');
let code = fs.readFileSync('src/lib/firebase.ts', 'utf8');

const restGetDocRepl = `export async function restGetDoc(docPath: string): Promise<any | null> {
  try {
    const cleanPath = docPath.startsWith('/') ? docPath.slice(1) : docPath;
    const parts = cleanPath.split('/');
    if (parts.length % 2 !== 0) return null;
    const ref = doc(db, parts[0], ...parts.slice(1));
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    return null;
  }
}`;

const restSetDocRepl = `export async function restSetDoc(docPath: string, data: any, merge: boolean = true): Promise<boolean> {
  try {
    const cleanPath = docPath.startsWith('/') ? docPath.slice(1) : docPath;
    const parts = cleanPath.split('/');
    if (parts.length % 2 !== 0) return false;
    const ref = doc(db, parts[0], ...parts.slice(1));
    await setDoc(ref, data, { merge });
    return true;
  } catch (e) {
    return false;
  }
}`;

const restDeleteDocRepl = `export async function restDeleteDoc(docPath: string): Promise<boolean> {
  try {
    const cleanPath = docPath.startsWith('/') ? docPath.slice(1) : docPath;
    const parts = cleanPath.split('/');
    if (parts.length % 2 !== 0) return false;
    const ref = doc(db, parts[0], ...parts.slice(1));
    await deleteDoc(ref);
    return true;
  } catch (e) {
    return false;
  }
}`;

const restListDocsRepl = `export async function restListDocs(collectionPath: string): Promise<any[] | null> {
  try {
    const cleanPath = collectionPath.startsWith('/') ? collectionPath.slice(1) : collectionPath;
    const parts = cleanPath.split('/');
    if (parts.length % 2 === 0) return null;
    const ref = collection(db, parts[0], ...parts.slice(1));
    const snap = await getDocs(ref);
    return snap.docs.map(d => d.data());
  } catch (e) {
    return null;
  }
}`;

// Replace restGetDoc
code = code.replace(/export async function restGetDoc[\s\S]*?(?=export async function restSetDoc)/, restGetDocRepl + '\n\n');
// Replace restSetDoc
code = code.replace(/export async function restSetDoc[\s\S]*?(?=export async function restDeleteDoc)/, restSetDocRepl + '\n\n');
// Replace restDeleteDoc
code = code.replace(/export async function restDeleteDoc[\s\S]*?(?=export async function restListDocs)/, restDeleteDocRepl + '\n\n');
// Replace restListDocs
code = code.replace(/export async function restListDocs[\s\S]*?(?=export const googleProvider)/, restListDocsRepl + '\n\n');

// Clean up unused FIRESTORE_REST_BASE block
code = code.replace(/\/\/ ============================================================================\n\/\/ DIRECT FIRESTORE REST API CLIENT[\s\S]*?(?=export async function restGetDoc)/, '// REST API wrappers using native SDK\n');

// Clean up the secondary encode/decode block
code = code.replace(/\/\/ ---------------------------------------------------------------------------\n\/\/ High-Speed REST Fallback[\s\S]*?(?=export function buildSyntheticUser)/, '\n');

fs.writeFileSync('src/lib/firebase.ts', code);
