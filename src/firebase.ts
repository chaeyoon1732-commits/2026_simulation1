import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

// Firebase 앱 초기화
// Initialize Firebase app with the configuration from firebase-applet-config.json
const app = initializeApp(firebaseConfig);

// Firestore 데이터베이스 인스턴스 생성
// Create Firestore database instance, respecting the specific database ID if provided
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Firebase 인증 인스턴스 생성
// Create Firebase Auth instance
export const auth = getAuth(app);

// Google 인증 제공자 생성
// Create Google Auth Provider
export const googleProvider = new GoogleAuthProvider();
