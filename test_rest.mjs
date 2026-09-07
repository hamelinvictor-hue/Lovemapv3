import fs from 'fs';
const firebaseConfig = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));

const projectId = firebaseConfig.projectId;
const apiKey = firebaseConfig.apiKey;
const dbId = firebaseConfig.firestoreDatabaseId || '(default)';
const FIRESTORE_REST_BASE = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents`;

const data = {
    test: "hello",
    partnerA: { name: undefined, id: 'partner_a' } // what does this do?
};

function toFirestoreValue(val) {
  if (val === null) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') return Number.isInteger(val) ? { integerValue: val.toString() } : { doubleValue: val };
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) return { arrayValue: { values: val.map(toFirestoreValue) } };
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}

const fields = {};
for (const [k, v] of Object.entries(data)) {
  if (v !== undefined) {
    fields[k] = toFirestoreValue(v);
  }
}

const docPath = 'couples/TEST-REST-CREATE-2';
const res = await fetch(`${FIRESTORE_REST_BASE}/${docPath}?key=${apiKey}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ fields })
});

console.log('Status:', res.status);
console.log('Body:', await res.text());
