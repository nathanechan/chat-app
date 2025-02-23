import { db } from './firebase';
import { collection, addDoc, getDocs, doc, setDoc, onSnapshot } from 'firebase/firestore';

export const addFriend = async (currentUserId, friendId) => {
  await setDoc(doc(db, 'friends', `${currentUserId}_${friendId}`), {
    user1: currentUserId,
    user2: friendId,
    status: 'pending',
  });
};

export const getFriends = (userId, callback) => {
  return onSnapshot(collection(db, 'friends'), (querySnapshot) => {
    const friends = querySnapshot.docs
      .filter(doc => doc.data().user1 === userId || doc.data().user2 === userId)
      .map(doc => (doc.data().user1 === userId ? doc.data().user2 : doc.data().user1));
    callback(friends);
  });
};