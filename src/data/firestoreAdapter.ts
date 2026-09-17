import { Capacitor } from '@capacitor/core';
import { FirebaseFirestore } from '@capacitor-firebase/firestore';
import type { QueryOperator } from '@capacitor-firebase/firestore';
import {
  doc,
  collection,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  query,
  where,
  limit as firestoreLimit,
} from 'firebase/firestore';
import type { WhereFilterOp } from 'firebase/firestore';
import { getFirestoreDb } from '../lib/firebase';

/**
 * Unified document snapshot representation across Capacitor native and Web modular Firebase JS SDK.
 */
export interface UnifiedDocumentSnapshot<T = any> {
  /** The unique document ID */
  id: string;
  /** Full document path in Firestore */
  path: string;
  /** True if the document exists in Firestore */
  exists: boolean;
  /** Method returning document data or null if non-existent */
  data: () => T | null;
  /** Direct access to document data or null */
  val: T | null;
}

/**
 * Filter criteria for Firestore collection queries
 */
export interface WhereFilter {
  field: string;
  operator: QueryOperator;
  value: any;
}

/**
 * Options for write operations
 */
export interface WriteOptions {
  merge?: boolean;
}

/**
 * Returns true if the app is running on a Capacitor native platform (iOS/Android)
 */
export function isNativeFirestore(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Safely retrieves Web Firestore instance only when needed on Web.
 */
function getWebDb(): any {
  return getFirestoreDb();
}

/**
 * Watches a single Firestore document in real-time.
 * Automatically switches between @capacitor-firebase/firestore (Native) and modular JS SDK (Web).
 * Correctly guards against React unmount race conditions where callbackId resolves after unsubscribe.
 *
 * @param path Document path (e.g. 'couples/XYZ123')
 * @param callback Callback receiving normalized UnifiedDocumentSnapshot
 * @param onError Optional error handler
 * @returns Unsubscribe function
 */
export function watchDocument<T = any>(
  path: string,
  callback: (snapshot: UnifiedDocumentSnapshot<T>) => void,
  onError?: (error: any) => void
): () => void {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  let isCancelled = false;
  let resolvedCallbackId: string | null = null;
  let jsUnsubscribe: (() => void) | null = null;

  if (Capacitor.isNativePlatform()) {
    FirebaseFirestore.addDocumentSnapshotListener<T>(
      { reference: cleanPath },
      (event, error) => {
        if (isCancelled) return;
        if (error) {
          if (onError) onError(error);
          return;
        }

        if (event && event.snapshot) {
          const snap = event.snapshot;
          const hasData = snap.data !== null && snap.data !== undefined;
          const unified: UnifiedDocumentSnapshot<T> = {
            id: snap.id || cleanPath.split('/').pop() || '',
            path: snap.path || cleanPath,
            exists: hasData,
            data: () => (hasData ? (snap.data as T) : null),
            val: hasData ? (snap.data as T) : null,
          };
          callback(unified);
        } else {
          callback({
            id: cleanPath.split('/').pop() || '',
            path: cleanPath,
            exists: false,
            data: () => null,
            val: null,
          });
        }
      }
    )
      .then((callbackId) => {
        if (isCancelled) {
          // React unmounted before callbackId resolved: unregister listener immediately
          FirebaseFirestore.removeSnapshotListener({ callbackId }).catch((err) => {
            console.warn('[firestoreAdapter] Cleanup notice for cancelled document listener:', err?.message);
          });
        } else {
          resolvedCallbackId = callbackId;
        }
      })
      .catch((err) => {
        if (!isCancelled && onError) {
          onError(err);
        }
      });

    return () => {
      isCancelled = true;
      if (resolvedCallbackId) {
        FirebaseFirestore.removeSnapshotListener({ callbackId: resolvedCallbackId }).catch((err) => {
          console.warn('[firestoreAdapter] Notice on removing document snapshot listener:', err?.message);
        });
        resolvedCallbackId = null;
      }
    };
  } else {
    try {
      const docRef = doc(getWebDb(), cleanPath);
      jsUnsubscribe = onSnapshot(
        docRef,
        (docSnap) => {
          if (isCancelled) return;
          const exists = docSnap.exists();
          const docData = exists ? (docSnap.data() as T) : null;
          const unified: UnifiedDocumentSnapshot<T> = {
            id: docSnap.id,
            path: docSnap.ref.path,
            exists,
            data: () => docData,
            val: docData,
          };
          callback(unified);
        },
        (error) => {
          if (!isCancelled && onError) {
            onError(error);
          }
        }
      );
    } catch (err) {
      if (!isCancelled && onError) {
        onError(err);
      }
    }

    return () => {
      isCancelled = true;
      if (jsUnsubscribe) {
        jsUnsubscribe();
        jsUnsubscribe = null;
      }
    };
  }
}

/**
 * Watches a Firestore collection filtered by a where clause in real-time.
 * Automatically switches between @capacitor-firebase/firestore (Native) and modular JS SDK (Web).
 * Correctly guards against React unmount race conditions where callbackId resolves after unsubscribe.
 *
 * @param collectionPath Collection path (e.g. 'couples/XYZ123/spots')
 * @param filter Query filter ({ field, operator, value })
 * @param callback Callback receiving array of normalized UnifiedDocumentSnapshot
 * @param onError Optional error handler
 * @returns Unsubscribe function
 */
export function watchCollectionWhere<T = any>(
  collectionPath: string,
  filter: WhereFilter,
  callback: (snapshots: UnifiedDocumentSnapshot<T>[]) => void,
  onError?: (error: any) => void
): () => void {
  const cleanPath = collectionPath.startsWith('/') ? collectionPath.slice(1) : collectionPath;
  let isCancelled = false;
  let resolvedCallbackId: string | null = null;
  let jsUnsubscribe: (() => void) | null = null;

  if (Capacitor.isNativePlatform()) {
    FirebaseFirestore.addCollectionSnapshotListener<T>(
      {
        reference: cleanPath,
        compositeFilter: {
          type: 'and',
          queryConstraints: [
            {
              type: 'where',
              fieldPath: filter.field,
              opStr: filter.operator,
              value: filter.value,
            },
          ],
        },
      },
      (event, error) => {
        if (isCancelled) return;
        if (error) {
          if (onError) onError(error);
          return;
        }

        const rawSnaps = event?.snapshots || [];
        const unified = rawSnaps.map((snap) => {
          const hasData = snap.data !== null && snap.data !== undefined;
          return {
            id: snap.id,
            path: snap.path,
            exists: hasData,
            data: () => (hasData ? (snap.data as T) : null),
            val: hasData ? (snap.data as T) : null,
          };
        });
        callback(unified);
      }
    )
      .then((callbackId) => {
        if (isCancelled) {
          // React unmounted before callbackId resolved: unregister listener immediately
          FirebaseFirestore.removeSnapshotListener({ callbackId }).catch((err) => {
            console.warn('[firestoreAdapter] Cleanup notice for cancelled collection listener:', err?.message);
          });
        } else {
          resolvedCallbackId = callbackId;
        }
      })
      .catch((err) => {
        if (!isCancelled && onError) {
          onError(err);
        }
      });

    return () => {
      isCancelled = true;
      if (resolvedCallbackId) {
        FirebaseFirestore.removeSnapshotListener({ callbackId: resolvedCallbackId }).catch((err) => {
          console.warn('[firestoreAdapter] Notice on removing collection snapshot listener:', err?.message);
        });
        resolvedCallbackId = null;
      }
    };
  } else {
    try {
      const colRef = collection(getWebDb(), cleanPath);
      const q = query(colRef, where(filter.field, filter.operator as WhereFilterOp, filter.value));
      jsUnsubscribe = onSnapshot(
        q,
        (querySnap) => {
          if (isCancelled) return;
          const unified = querySnap.docs.map((d) => {
            const exists = d.exists();
            const docData = exists ? (d.data() as T) : null;
            return {
              id: d.id,
              path: d.ref.path,
              exists,
              data: () => docData,
              val: docData,
            };
          });
          callback(unified);
        },
        (error) => {
          if (!isCancelled && onError) {
            onError(error);
          }
        }
      );
    } catch (err) {
      if (!isCancelled && onError) {
        onError(err);
      }
    }

    return () => {
      isCancelled = true;
      if (jsUnsubscribe) {
        jsUnsubscribe();
        jsUnsubscribe = null;
      }
    };
  }
}

/**
 * Writes or overwrites a Firestore document.
 *
 * @param path Document path (e.g. 'couples/XYZ123')
 * @param data Document data object
 * @param options Optional options such as merge: true
 */
export async function writeDocument<T extends Record<string, any> = Record<string, any>>(
  path: string,
  data: T,
  options?: WriteOptions
): Promise<void> {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  if (Capacitor.isNativePlatform()) {
    await FirebaseFirestore.setDocument({
      reference: cleanPath,
      data: data as any,
      merge: options?.merge ?? false,
    });
  } else {
    const docRef = doc(getWebDb(), cleanPath);
    await setDoc(docRef, data, { merge: options?.merge ?? false });
  }
}

/**
 * Updates specific fields in an existing Firestore document.
 *
 * @param path Document path (e.g. 'couples/XYZ123')
 * @param data Fields to update
 */
export async function patchDocument<T extends Record<string, any> = Record<string, any>>(
  path: string,
  data: Partial<T>
): Promise<void> {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  if (Capacitor.isNativePlatform()) {
    await FirebaseFirestore.updateDocument({
      reference: cleanPath,
      data: data as any,
    });
  } else {
    const docRef = doc(getWebDb(), cleanPath);
    await updateDoc(docRef, data as any);
  }
}

/**
 * Creates a new document with an auto-generated ID inside a collection.
 *
 * @param collectionPath Collection path (e.g. 'couples/XYZ123/spots')
 * @param data New document payload
 * @returns Object containing the created id and full path
 */
export async function createDocument<T extends Record<string, any> = Record<string, any>>(
  collectionPath: string,
  data: T
): Promise<{ id: string; path: string }> {
  const cleanPath = collectionPath.startsWith('/') ? collectionPath.slice(1) : collectionPath;
  if (Capacitor.isNativePlatform()) {
    const res = await FirebaseFirestore.addDocument({
      reference: cleanPath,
      data: data as any,
    });
    return {
      id: res.reference.id,
      path: res.reference.path,
    };
  } else {
    const colRef = collection(getWebDb(), cleanPath);
    const docRef = await addDoc(colRef, data);
    return {
      id: docRef.id,
      path: docRef.path,
    };
  }
}

/**
 * Reads a single document from Firestore.
 * Automatically switches between @capacitor-firebase/firestore (Native) and modular JS SDK (Web).
 *
 * @param path Document path (e.g. 'couples/XYZ123')
 * @returns UnifiedDocumentSnapshot
 */
export async function getDocument<T = any>(path: string): Promise<UnifiedDocumentSnapshot<T>> {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  if (Capacitor.isNativePlatform()) {
    const res = await FirebaseFirestore.getDocument<T>({ reference: cleanPath });
    const snap = res?.snapshot;
    const hasData = snap && snap.data !== null && snap.data !== undefined;
    return {
      id: snap?.id || cleanPath.split('/').pop() || '',
      path: snap?.path || cleanPath,
      exists: Boolean(hasData),
      data: () => (hasData ? (snap.data as T) : null),
      val: hasData ? (snap.data as T) : null,
    };
  } else {
    const docRef = doc(getWebDb(), cleanPath);
    const snap = await getDoc(docRef);
    const exists = snap.exists();
    const docData = exists ? (snap.data() as T) : null;
    return {
      id: snap.id,
      path: snap.ref.path,
      exists,
      data: () => docData,
      val: docData,
    };
  }
}

/**
 * Deletes a document from Firestore.
 *
 * @param path Document path (e.g. 'couples/XYZ123/spots/spot1')
 */
export async function deleteDocument(path: string): Promise<void> {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  if (Capacitor.isNativePlatform()) {
    await FirebaseFirestore.deleteDocument({ reference: cleanPath });
  } else {
    const docRef = doc(getWebDb(), cleanPath);
    await deleteDoc(docRef);
  }
}

/**
 * Watches an entire collection in real-time.
 * Automatically switches between @capacitor-firebase/firestore (Native) and modular JS SDK (Web).
 * Handles React race conditions where callbackId resolves after unmount.
 *
 * @param collectionPath Path to collection (e.g. 'couples/XYZ123/spots')
 * @param callback Callback receiving array of UnifiedDocumentSnapshot
 * @param onError Optional error callback
 * @returns Unsubscribe function
 */
export function watchCollection<T = any>(
  collectionPath: string,
  callback: (snapshots: UnifiedDocumentSnapshot<T>[]) => void,
  onError?: (error: any) => void
): () => void {
  const cleanPath = collectionPath.startsWith('/') ? collectionPath.slice(1) : collectionPath;
  let isCancelled = false;
  let resolvedCallbackId: string | null = null;
  let jsUnsubscribe: (() => void) | null = null;

  if (Capacitor.isNativePlatform()) {
    FirebaseFirestore.addCollectionSnapshotListener<T>(
      { reference: cleanPath },
      (event, error) => {
        if (isCancelled) return;
        if (error) {
          if (onError) onError(error);
          return;
        }

        const rawSnaps = event?.snapshots || [];
        const unified = rawSnaps.map((snap) => {
          const hasData = snap.data !== null && snap.data !== undefined;
          return {
            id: snap.id,
            path: snap.path,
            exists: hasData,
            data: () => (hasData ? (snap.data as T) : null),
            val: hasData ? (snap.data as T) : null,
          };
        });
        callback(unified);
      }
    )
      .then((callbackId) => {
        if (isCancelled) {
          FirebaseFirestore.removeSnapshotListener({ callbackId }).catch((err) => {
            console.warn('[firestoreAdapter] Cleanup notice for cancelled collection listener:', err?.message);
          });
        } else {
          resolvedCallbackId = callbackId;
        }
      })
      .catch((err) => {
        if (!isCancelled && onError) {
          onError(err);
        }
      });

    return () => {
      isCancelled = true;
      if (resolvedCallbackId) {
        FirebaseFirestore.removeSnapshotListener({ callbackId: resolvedCallbackId }).catch((err) => {
          console.warn('[firestoreAdapter] Notice on removing collection listener:', err?.message);
        });
        resolvedCallbackId = null;
      }
    };
  } else {
    try {
      const colRef = collection(getWebDb(), cleanPath);
      jsUnsubscribe = onSnapshot(
        colRef,
        (querySnap) => {
          if (isCancelled) return;
          const unified = querySnap.docs.map((d) => {
            const exists = d.exists();
            const docData = exists ? (d.data() as T) : null;
            return {
              id: d.id,
              path: d.ref.path,
              exists,
              data: () => docData,
              val: docData,
            };
          });
          callback(unified);
        },
        (error) => {
          if (!isCancelled && onError) {
            onError(error);
          }
        }
      );
    } catch (err) {
      if (!isCancelled && onError) {
        onError(err);
      }
    }

    return () => {
      isCancelled = true;
      if (jsUnsubscribe) {
        jsUnsubscribe();
        jsUnsubscribe = null;
      }
    };
  }
}

/**
 * Fetches all documents in a collection.
 *
 * @param collectionPath Path to collection (e.g. 'couples/XYZ123/spots')
 * @returns Array of UnifiedDocumentSnapshot
 */
export async function getCollection<T = any>(collectionPath: string): Promise<UnifiedDocumentSnapshot<T>[]> {
  const cleanPath = collectionPath.startsWith('/') ? collectionPath.slice(1) : collectionPath;
  if (Capacitor.isNativePlatform()) {
    const res = await FirebaseFirestore.getCollection<T>({ reference: cleanPath });
    const rawSnaps = res?.snapshots || [];
    return rawSnaps.map((snap) => {
      const hasData = snap.data !== null && snap.data !== undefined;
      return {
        id: snap.id,
        path: snap.path,
        exists: hasData,
        data: () => (hasData ? (snap.data as T) : null),
        val: hasData ? (snap.data as T) : null,
      };
    });
  } else {
    const colRef = collection(getWebDb(), cleanPath);
    const snap = await getDocs(colRef);
    return snap.docs.map((d) => {
      const exists = d.exists();
      const docData = exists ? (d.data() as T) : null;
      return {
        id: d.id,
        path: d.ref.path,
        exists,
        data: () => docData,
        val: docData,
      };
    });
  }
}

/**
 * Queries a collection with a single where condition.
 *
 * @param collectionPath Path to collection (e.g. 'couples')
 * @param filter Where filter
 * @returns Array of UnifiedDocumentSnapshot
 */
export async function queryCollectionWhere<T = any>(
  collectionPath: string,
  filter: WhereFilter
): Promise<UnifiedDocumentSnapshot<T>[]> {
  const cleanPath = collectionPath.startsWith('/') ? collectionPath.slice(1) : collectionPath;
  if (Capacitor.isNativePlatform()) {
    const res = await FirebaseFirestore.getCollection<T>({
      reference: cleanPath,
      compositeFilter: {
        type: 'and',
        queryConstraints: [
          {
            type: 'where',
            fieldPath: filter.field,
            opStr: filter.operator,
            value: filter.value,
          },
        ],
      },
    });
    const rawSnaps = res?.snapshots || [];
    return rawSnaps.map((snap) => {
      const hasData = snap.data !== null && snap.data !== undefined;
      return {
        id: snap.id,
        path: snap.path,
        exists: hasData,
        data: () => (hasData ? (snap.data as T) : null),
        val: hasData ? (snap.data as T) : null,
      };
    });
  } else {
    const colRef = collection(getWebDb(), cleanPath);
    const q = query(colRef, where(filter.field, filter.operator as WhereFilterOp, filter.value));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const exists = d.exists();
      const docData = exists ? (d.data() as T) : null;
      return {
        id: d.id,
        path: d.ref.path,
        exists,
        data: () => docData,
        val: docData,
      };
    });
  }
}
