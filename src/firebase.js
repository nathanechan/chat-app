import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { getDatabase, ref, set, onValue, onDisconnect } from 'firebase/database';

const firebaseConfig = {
  apiKey: "你的 API Key",
  authDomain: "你的 authDomain",
  projectId: "你的 projectId",
  storageBucket: "你的 storageBucket",
  messagingSenderId: "你的 messagingSenderId",
  appId: "你的 appId",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app); // 用于用户关系和群组
export const rdb = getDatabase(app); // 用于信令和在线状态