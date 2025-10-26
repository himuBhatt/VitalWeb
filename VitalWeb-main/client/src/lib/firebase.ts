// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration (NEW PROJECT)
const firebaseConfig = {
  apiKey: "AIzaSyC5rJjD8Lx4k1tnurT0fDdTgwXRNCe8KWs",
  authDomain: "minor-project-d0f9b.firebaseapp.com",
  databaseURL: "https://minor-project-d0f9b-default-rtdb.firebaseio.com",
  projectId: "minor-project-d0f9b",
  storageBucket: "minor-project-d0f9b.appspot.com", // fixed typo: .app → .appspot.com
  messagingSenderId: "752322401091",
  appId: "1:752322401091:web:0d823932bb94c5a39655f6",
  measurementId: "G-8MQJ0JNYV7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = typeof window !== "undefined" ? getAnalytics(app) : null;
const auth = getAuth(app);
const db = getFirestore(app);
const rtdb = getDatabase(app);
const storage = getStorage(app);

export { app, analytics, auth, db, rtdb, storage };