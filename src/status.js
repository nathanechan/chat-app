import { rdb } from './firebase';
import { ref, set, onValue, onDisconnect } from 'firebase/database';

export const setOnlineStatus = (userId, online) => {
  const statusRef = ref(rdb, `status/${userId}`);
  set(statusRef, { online });
  onDisconnect(statusRef).set({ online: false });
};

export const getOnlineStatus = (userId, callback) => {
  const statusRef = ref(rdb, `status/${userId}`);
  onValue(statusRef, (snapshot) => {
    callback(snapshot.val()?.online || false);
  });
};