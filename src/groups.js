import { db } from './firebase';
import { collection, addDoc, getDocs, doc, setDoc, onSnapshot, updateDoc, arrayUnion } from 'firebase/firestore';

export const createGroup = async (name, creatorId) => {
  const groupRef = await addDoc(collection(db, 'groups'), {
    name,
    members: [creatorId],
    createdBy: creatorId,
    createdAt: new Date().toISOString(),
  });
  return groupRef.id;
};

export const joinGroup = async (groupId, userId) => {
  const groupRef = doc(db, 'groups', groupId);
  const groupDoc = await getDocs(doc(db, 'groups', groupId));
  if (groupDoc.exists() && !groupDoc.data().members.includes(userId)) {
    await updateDoc(groupRef, {
      members: arrayUnion(userId),
    });
  }
};

export const getGroups = (userId, callback) => {
  return onSnapshot(collection(db, 'groups'), (querySnapshot) => {
    const groups = querySnapshot.docs
      .filter(doc => doc.data().members.includes(userId))
      .map(doc => ({ id: doc.id, ...doc.data() }));
    callback(groups);
  });
};