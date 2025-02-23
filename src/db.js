import { openDB } from 'idb';

const dbPromise = openDB('ChatDB', 3, {
  upgrade(db, oldVersion) {
    if (oldVersion < 1) {
      db.createObjectStore('chats', { keyPath: 'id', autoIncrement: true });
    }
    if (oldVersion < 2) {
      db.createObjectStore('friends', { keyPath: 'address' });
      db.createObjectStore('requests', { keyPath: 'id', autoIncrement: true });
    }
    if (oldVersion < 3) {
      db.createObjectStore('groups', { keyPath: 'id' });
      db.createObjectStore('groupChats', { keyPath: 'id', autoIncrement: true });
    }
  },
});

// 好友聊天记录
export async function addChat(friendAddress, message, isSent) {
  const db = await dbPromise;
  await db.add('chats', { friendAddress, message, isSent, timestamp: Date.now() });
}

export async function getChats(friendAddress) {
  const db = await dbPromise;
  const allChats = await db.getAll('chats');
  return allChats.filter(chat => chat.friendAddress === friendAddress);
}

export async function clearChats() {
  const db = await dbPromise;
  await db.clear('chats');
}

// 好友管理
export async function addFriend(address, name) {
  const db = await dbPromise;
  await db.put('friends', { address, name, addedAt: Date.now() });
}

export async function getFriends() {
  const db = await dbPromise;
  return await db.getAll('friends');
}

export async function removeFriend(address) {
  const db = await dbPromise;
  await db.delete('friends', address);
}

// 好友请求
export async function addRequest(fromAddress, toAddress) {
  const db = await dbPromise;
  await db.add('requests', { fromAddress, toAddress, status: 'pending', timestamp: Date.now() });
}

export async function getRequests() {
  const db = await dbPromise;
  return await db.getAll('requests');
}

export async function updateRequest(id, status) {
  const db = await dbPromise;
  const request = await db.get('requests', id);
  if (request) {
    request.status = status;
    await db.put('requests', request);
  }
}

export async function clearRequests() {
  const db = await dbPromise;
  await db.clear('requests');
}

// 群组管理
export async function addGroup(id, name, isPublic, creator) {
  const db = await dbPromise;
  await db.put('groups', { id, name, isPublic, creator, members: [creator], createdAt: Date.now() });
}

export async function getGroups() {
  const db = await dbPromise;
  return await db.getAll('groups');
}

export async function joinGroup(id, memberAddress) {
  const db = await dbPromise;
  const group = await db.get('groups', id);
  if (group && !group.members.includes(memberAddress)) {
    group.members.push(memberAddress);
    await db.put('groups', group);
  }
}

export async function leaveGroup(id, memberAddress) {
  const db = await dbPromise;
  const group = await db.get('groups', id);
  if (group) {
    group.members = group.members.filter(member => member !== memberAddress);
    await db.put('groups', group);
  }
}

export async function removeMember(id, memberAddress, creator) {
  const db = await dbPromise;
  const group = await db.get('groups', id);
  if (group && group.creator === creator) {
    group.members = group.members.filter(member => member !== memberAddress);
    await db.put('groups', group);
  }
}

// 群组聊天
export async function addGroupChat(groupId, sender, message) {
  const db = await dbPromise;
  await db.add('groupChats', { groupId, sender, message, timestamp: Date.now() });
}

export async function getGroupChats(groupId) {
  const db = await dbPromise;
  const allChats = await db.getAll('groupChats');
  return allChats.filter(chat => chat.groupId === groupId);
}

export async function clearGroupChats() {
  const db = await dbPromise;
  await db.clear('groupChats');
}