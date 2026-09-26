import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, getFirestore, doc, getDocFromServer } from "firebase/firestore";
import firebaseAppletConfig from "../firebase-applet-config.json";

// Exact Firebase configuration provided by user
export const firebaseConfig = {
  apiKey: firebaseAppletConfig.apiKey || "AIzaSyCPfMrTNupafRas9ZD1Yu8R1cqPT37Xxy4",
  authDomain: firebaseAppletConfig.authDomain || "calorielens-570ed.firebaseapp.com",
  projectId: firebaseAppletConfig.projectId || "calorielens-570ed",
  storageBucket: firebaseAppletConfig.storageBucket || "calorielens-570ed.firebasestorage.app",
  messagingSenderId: firebaseAppletConfig.messagingSenderId || "777264955495",
  appId: firebaseAppletConfig.appId || "1:777264955495:web:2bf22dd161a8fb64a894c2",
  measurementId: firebaseAppletConfig.measurementId || "G-MMGEYS9J0T",
  firestoreDatabaseId:
    (firebaseAppletConfig as any).firestoreDatabaseId ||
    "ai-studio-remixcalorielens-b4282620-b4fe-4c21-a466-db930886b3d2",
};

export const databaseId = firebaseConfig.firestoreDatabaseId;

// Initialize Firebase App
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// Initialize Firestore with auto-detect long-polling and ignoreUndefinedProperties
const isBrowser = typeof window !== "undefined";

let firestoreDb: ReturnType<typeof getFirestore>;
try {
  firestoreDb = initializeFirestore(
    app,
    {
      ...(isBrowser
        ? {
            experimentalAutoDetectLongPolling: true,
          }
        : {}),
      ignoreUndefinedProperties: true,
    },
    databaseId
  );
} catch {
  firestoreDb = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
}
export const db = firestoreDb;

// Validate Connection to Firestore per Firebase Skill guidelines
if (isBrowser) {
  const testConnection = async () => {
    try {
      await getDocFromServer(doc(db, "test", "connection"));
    } catch (error) {
      if (error instanceof Error && error.message.includes("the client is offline")) {
        console.warn("[Firestore] Operating in offline mode until connection is re-established.");
      }
    }
  };
  testConnection().catch(() => {});
}

// Error Handling Infrastructure per Firebase Security Standards
export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
