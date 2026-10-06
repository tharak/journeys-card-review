import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, collection, doc, getDoc, onSnapshot, writeBatch, runTransaction, serverTimestamp } from 'firebase/firestore';

// Import only the services used by the catalog. Loaded when cloud saving is enabled.
export default [
  { initializeApp },
  { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut },
  { getFirestore, collection, doc, getDoc, onSnapshot, writeBatch, runTransaction, serverTimestamp },
];
