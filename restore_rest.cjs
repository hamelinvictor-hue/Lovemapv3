const fs = require('fs');
let code = fs.readFileSync('src/lib/firebase.ts', 'utf8');

const restCode = `
// ============================================================================
// DIRECT FIRESTORE REST API CLIENT (Native fetch, zero WKWebView hangs, <80ms latency)
// ============================================================================

const FIRESTORE_REST_BASE = \`https://firestore.googleapis.com/v1/projects/\${firebaseConfig.projectId}/databases/\${firebaseConfig.firestoreDatabaseId || '(default)'}/documents\`;

// Helper to convert Firestore format to standard JSON
function fromFirestoreDoc(doc: any): any {
  const data: any = {};
  if (!doc || !doc.fields) return data;
  for (const [key, value] of Object.entries(doc.fields)) {
    const val = value as any;
    if (val.stringValue !== undefined) data[key] = val.stringValue;
    else if (val.integerValue !== undefined) data[key] = Number(val.integerValue);
    else if (val.doubleValue !== undefined) data[key] = Number(val.doubleValue);
    else if (val.booleanValue !== undefined) data[key] = Boolean(val.booleanValue);
    else if (val.mapValue !== undefined) data[key] = fromFirestoreDoc({ fields: val.mapValue.fields });
    else if (val.arrayValue !== undefined) {
      data[key] = (val.arrayValue.values || []).map((v: any) => {
        if (v.stringValue !== undefined) return v.stringValue;
        if (v.mapValue !== undefined) return fromFirestoreDoc({ fields: v.mapValue.fields });
        return v; // Simplify for now
      });
    }
  }
  return data;
}

function toFirestoreValue(value: any): any {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: value } : { doubleValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (value && typeof value === 'object') {
    const fields: any = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}

export async function restGetDoc(docPath: string): Promise<any | null> {
  try {
    const cleanPath = docPath.startsWith('/') ? docPath.slice(1) : docPath;
    const res = await fetch(\`\${FIRESTORE_REST_BASE}/\${cleanPath}?key=\${firebaseConfig.apiKey}&_t=\${Date.now()}\`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = await res.json();
    return fromFirestoreDoc(json);
  } catch (e) {
    return null;
  }
}

export async function restSetDoc(docPath: string, data: any, merge: boolean = true): Promise<boolean> {
  try {
    const cleanPath = docPath.startsWith('/') ? docPath.slice(1) : docPath;
    const fields: Record<string, any> = {};
    const fieldMasks: string[] = [];
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) {
        fields[k] = toFirestoreValue(v);
        fieldMasks.push(\`updateMask.fieldPaths=\${encodeURIComponent(k)}\`);
      }
    }
    const maskQuery = merge && fieldMasks.length > 0 ? \`&\${fieldMasks.join('&')}\` : '';
    const res = await fetch(\`\${FIRESTORE_REST_BASE}/\${cleanPath}?key=\${firebaseConfig.apiKey}\${maskQuery}\`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
      cache: 'no-store',
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

export async function restDeleteDoc(docPath: string): Promise<boolean> {
  try {
    const cleanPath = docPath.startsWith('/') ? docPath.slice(1) : docPath;
    const res = await fetch(\`\${FIRESTORE_REST_BASE}/\${cleanPath}?key=\${firebaseConfig.apiKey}\`, {
      method: 'DELETE',
      cache: 'no-store',
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

export async function restListDocs(collectionPath: string): Promise<any[] | null> {
  try {
    const cleanPath = collectionPath.startsWith('/') ? collectionPath.slice(1) : collectionPath;
    const parts = cleanPath.split('/');
    if (parts.length % 2 === 0) return null; // Must be a collection path

    const collectionId = parts.pop();
    const parentPath = parts.join('/');
    const urlPath = parentPath ? \`\${parentPath}:runQuery\` : ':runQuery';

    const res = await fetch(\`\${FIRESTORE_REST_BASE}/\${urlPath}?key=\${firebaseConfig.apiKey}\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId }]
        }
      }),
      cache: 'no-store',
    });
    
    if (!res.ok) return null;
    const json = await res.json();
    
    const results: any[] = [];
    if (Array.isArray(json)) {
      for (const item of json) {
        if (item.document) {
          const d = item.document;
          const data = fromFirestoreDoc(d);
          const nameParts = (d.name || '').split('/');
          const id = nameParts[nameParts.length - 1];
          results.push({ ...data, id: data?.id || id });
        }
      }
    }
    return results;
  } catch (e) {
    return null;
  }
}
`;

// Find the section starting at "// REST API wrappers using native SDK"
// and ending before "export const googleProvider = new GoogleAuthProvider();"

const startMarker = "// REST API wrappers using native SDK";
const endMarker = "export const googleProvider";

const startIndex = code.indexOf(startMarker);
const endIndex = code.indexOf(endMarker);

if (startIndex !== -1 && endIndex !== -1) {
  code = code.substring(0, startIndex) + restCode + '\n' + code.substring(endIndex);
  fs.writeFileSync('src/lib/firebase.ts', code);
  console.log('Restored REST wrappers.');
} else {
  console.log('Could not find markers', { startIndex, endIndex });
}
