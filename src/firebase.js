import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyBKQIlCgurSKs5l3AejrmpdWDPGnNVbImA",
  authDomain: "chat-app-eaf5d.firebaseapp.com",
  projectId: "chat-app-eaf5d",
  storageBucket: "chat-app-eaf5d.firebasestorage.app",
  messagingSenderId: "372659120834",
  appId: "1:372659120834:web:b3c0c9370cb03eb34aa95b",
  measurementId: "G-6PQDS9ZHNE"
};


const app = initializeApp(firebaseConfig);
export const db = getFirestore(app); // 用于用户关系和群组
export const rdb = getDatabase(app); // 用于信令和在线状态