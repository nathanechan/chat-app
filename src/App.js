import React, { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import Peer from 'simple-peer';
import { 
  db, rdb 
} from './firebase';
import { 
  collection, addDoc, getDocs, doc, setDoc, onSnapshot, updateDoc, arrayUnion, deleteDoc
} from 'firebase/firestore';
import { 
  ref as rdbRef, set, onValue, onDisconnect, push 
} from 'firebase/database';
import './App.css';

function App() {
  const [walletAddress, setWalletAddress] = useState(null);
  const [friends, setFriends] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null); // 选中的好友或群组
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [friendAddressInput, setFriendAddressInput] = useState('');
  const [groupNameInput, setGroupNameInput] = useState('');
  const [groupIdInput, setGroupIdInput] = useState('');
  const [isOnline, setIsOnline] = useState(false);
  const peerRefs = useRef({});
  const [peerConnections, setPeerConnections] = useState({});

  // 连接 EVM 钱包
  const connectWallet = async () => {
    if (!window.ethereum) {
      alert("Please install MetaMask or connect your wallet!");
      return;
    }
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      setWalletAddress(address);
      await setDoc(doc(db, 'users', address), {
        walletAddress: address,
        createdAt: new Date().toISOString(),
      }, { merge: true });
      setOnlineStatus(address, true);
    } catch (error) {
      alert("Failed to connect wallet: " + error.message);
    }
  };

  // 设置在线状态
  const setOnlineStatus = (userId, online) => {
    const statusRef = rdbRef(rdb, `status/${userId}`);
    set(statusRef, { online });
    onDisconnect(statusRef).set({ online: false });
  };

  // 获取在线状态
  const getOnlineStatus = (userId) => {
    const statusRef = rdbRef(rdb, `status/${userId}`);
    onValue(statusRef, (snapshot) => {
      setIsOnline(snapshot.val()?.online || false);
    });
  };

  // 添加好友
  const addFriend = async () => {
    if (friendAddressInput.trim() && friendAddressInput !== walletAddress) {
      try {
        console.log("Adding friend:", friendAddressInput);
        await setDoc(doc(db, 'friends', `${walletAddress}_${friendAddressInput}`), {
          user1: walletAddress,
          user2: friendAddressInput,
          status: 'accepted', // 直接设置为 accepted
          createdAt: new Date().toISOString(), // 添加创建时间以便清理
        });
        console.log("Friend added successfully");
        setFriendAddressInput('');
        alert("Friend request sent and accepted automatically!");
        loadFriends(); // 刷新好友列表
      } catch (error) {
        console.error("Error adding friend:", error);
        alert("Failed to add friend: " + error.message);
      }
    } else {
      alert("Please enter a valid friend address (not your own)!");
    }
  };

  // 获取好友列表
  const loadFriends = () => {
    return onSnapshot(collection(db, 'friends'), (querySnapshot) => {
      const friendList = querySnapshot.docs
        .filter(doc => (doc.data().user1 === walletAddress || doc.data().user2 === walletAddress) && doc.data().status === 'accepted')
        .map(doc => (doc.data().user1 === walletAddress ? doc.data().user2 : doc.data().user1));
      setFriends(friendList);
    });
  };

  // 创建群组
  const createGroup = async () => {
    if (groupNameInput.trim()) {
      const groupRef = await addDoc(collection(db, 'groups'), {
        name: groupNameInput,
        members: [walletAddress],
        createdBy: walletAddress,
        createdAt: new Date().toISOString(),
      });
      setGroups(prev => [...prev, { id: groupRef.id, name: groupNameInput, members: [walletAddress] }]);
      setGroupNameInput('');
      alert("Group created!");
    }
  };

  // 加入群组
  const joinGroup = async () => {
    if (groupIdInput.trim()) {
      const groupRef = doc(db, 'groups', groupIdInput);
      const groupDoc = await getDocs(doc(db, 'groups', groupIdInput));
      if (groupDoc.exists() && !groupDoc.data().members.includes(walletAddress)) {
        await updateDoc(groupRef, {
          members: arrayUnion(walletAddress),
        });
        setGroups(prev => [...prev, { id: groupIdInput, ...groupDoc.data(), members: [...groupDoc.data().members, walletAddress] }]);
        setGroupIdInput('');
        alert("Joined group!");
      } else {
        alert("Group not found or already joined!");
      }
    }
  };

  // 离开群组
  const leaveGroup = async (groupId) => {
    const groupRef = doc(db, 'groups', groupId);
    const groupDoc = await getDocs(groupRef);
    if (groupDoc.exists() && groupDoc.data().members.includes(walletAddress)) {
      await updateDoc(groupRef, {
        members: arrayRemove(walletAddress), // 假设 arrayRemove 已导入
      });
      setGroups(prev => prev.filter(g => g.id !== groupId));
      if (selectedChat === groupId) {
        setSelectedChat(null);
        setMessages([]);
      }
      alert("Left group successfully!");
    } else {
      alert("Group not found or you are not a member!");
    }
  };

  // 获取群组列表
  const loadGroups = () => {
    return onSnapshot(collection(db, 'groups'), (querySnapshot) => {
      const groupList = querySnapshot.docs
        .filter(doc => doc.data().members.includes(walletAddress))
        .map(doc => ({ id: doc.id, ...doc.data() }));
      setGroups(groupList);
    });
  };

  // WebRTC 信令和连接（点对点和群组）
  const initiatePeerConnection = (targetAddress, isGroup = false) => {
    const peer = new Peer({ initiator: walletAddress < targetAddress, trickle: false });
    peerRefs.current[targetAddress] = peer;

    peer.on('signal', (data) => {
      console.log("Sending signal data:", data);
      const signalingRef = rdbRef(rdb, `signaling/${walletAddress}_${targetAddress}${isGroup ? '_group' : ''}`);
      set(signalingRef, data).catch(error => console.error("Error sending signal:", error));
    });

    peer.on('connect', () => {
      console.log(`Connected to ${targetAddress}${isGroup ? ' (Group)' : ''}`);
      setPeerConnections(prev => ({ ...prev, [targetAddress]: peer }));
    });

    peer.on('data', (data) => {
      const message = JSON.parse(data);
      storeMessage(walletAddress, message, targetAddress);
      setMessages([...getMessages(walletAddress, targetAddress)]);
    });

    peer.on('error', (error) => {
      console.error("WebRTC error:", error);
    });

    peer.on('close', () => {
      console.log("WebRTC connection closed");
    });

    const signalingPath = isGroup ? `signaling/${targetAddress}_${walletAddress}_group` : `signaling/${targetAddress}_${walletAddress}`;
    onValue(rdbRef(rdb, signalingPath), (snapshot) => {
      const signalData = snapshot.val();
      if (signalData && peer) {
        console.log("Received signal data:", signalData);
        peer.signal(signalData).catch(error => console.error("Error signaling peer:", error));
      }
    });
  };

  // 发送消息（点对点或群组）
  const sendMessage = () => {
    if (input.trim() && selectedChat) {
      const message = { text: input, sender: walletAddress, timestamp: new Date().toISOString() };
      storeMessage(walletAddress, message, selectedChat);
      setMessages([...getMessages(walletAddress, selectedChat), message]);
      const peer = peerConnections[selectedChat];
      if (groups.some(g => g.id === selectedChat)) {
        sendGroupMessage(selectedChat, message); // 广播到群组
      } else if (peer) {
        peer.send(JSON.stringify(message)); // 点对点
      }
      setInput('');
    }
  };

  // 群组聊天支持
  const sendGroupMessage = (groupId, message) => {
    const groupRef = rdbRef(rdb, `groupMessages/${groupId}`);
    push(groupRef, { text: message.text, sender: message.sender, timestamp: message.timestamp });
  };

  useEffect(() => {
    if (selectedChat && groups.some(g => g.id === selectedChat)) {
      const groupRef = rdbRef(rdb, `groupMessages/${selectedChat}`);
      onValue(groupRef, (snapshot) => {
        const messages = [];
        snapshot.forEach((childSnapshot) => {
          messages.push(childSnapshot.val());
        });
        setMessages(messages);
      });
    }
  }, [selectedChat, groups]);

  // 本地存储对话
  const storeMessage = (userId, message, targetId) => {
    const key = `messages_${userId}_${targetId}`;
    let messages = JSON.parse(localStorage.getItem(key) || '[]');
    messages.push(message);
    if (messages.length > 100) {
      messages = messages.slice(-100); // 保留最后 100 条
    }
    localStorage.setItem(key, JSON.stringify(messages));
  };

  const getMessages = (userId, targetId) => {
    const key = `messages_${userId}_${targetId}`;
    return JSON.parse(localStorage.getItem(key) || '[]');
  };

  // 清理旧 Firebase 数据（每月运行一次）
  const cleanupOldData = async () => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30)).toISOString();
    const friendsSnapshot = await getDocs(collection(db, 'friends'));
    friendsSnapshot.forEach(async (doc) => {
      if (doc.data().createdAt < thirtyDaysAgo) {
        await deleteDoc(doc.ref);
      }
    });
    const groupsSnapshot = await getDocs(collection(db, 'groups'));
    groupsSnapshot.forEach(async (doc) => {
      if (doc.data().createdAt < thirtyDaysAgo) {
        await deleteDoc(doc.ref);
      }
    });
  };

  // 生命周期
  useEffect(() => {
    let unsubscribeFriends, unsubscribeGroups;
    if (walletAddress) {
      unsubscribeFriends = loadFriends();
      unsubscribeGroups = loadGroups();
      setOnlineStatus(walletAddress, true);
      getOnlineStatus(walletAddress);
      const cleanupInterval = setInterval(cleanupOldData, 1000 * 60 * 60 * 24 * 30); // 每月运行一次
      return () => {
        unsubscribeFriends?.();
        unsubscribeGroups?.();
        clearInterval(cleanupInterval);
      };
    }
  }, [walletAddress]);

  useEffect(() => {
    if (selectedChat) {
      setMessages(getMessages(walletAddress, selectedChat));
      if (!peerRefs.current[selectedChat]) {
        initiatePeerConnection(selectedChat, groups.some(g => g.id === selectedChat));
      }
    }
  }, [selectedChat, walletAddress, groups]);

  return (
    <div className="App">
      {!walletAddress ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <button onClick={connectWallet}>Connect Wallet</button>
        </div>
      ) : (
        <>
          <div className="logo">
            <img src="https://via.placeholder.com/40" alt="Chat App Logo" />
          </div>
          <div className="content">
            <div className="sidebar">
              <h3>Friends & Groups</h3>
              {friends.length > 0 && (
                <>
                  <div>
                    <h4>Add Friend</h4>
                    <input
                      type="text"
                      value={friendAddressInput}
                      onChange={(e) => setFriendAddressInput(e.target.value)}
                      placeholder="Enter friend wallet address"
                    />
                    <button onClick={addFriend}>Add Friend</button>
                  </div>
                  <h4>Friend Requests</h4>
                  <p>No friend requests (requests are auto-accepted)</p>
                  <h4>Friend List</h4>
                  {friends.map(friend => (
                    <div key={friend} className="message clickable" onClick={() => setSelectedChat(friend)}>
                      {friend.slice(0, 10)}... {isOnline ? '(Online)' : '(Offline)'}
                    </div>
                  ))}
                </>
              )}
              {groups.length > 0 && (
                <>
                  <h4>Create Group</h4>
                  <input
                    type="text"
                    value={groupNameInput}
                    onChange={(e) => setGroupNameInput(e.target.value)}
                    placeholder="Enter group name"
                  />
                  <button onClick={createGroup}>Create</button>
                  <h4>Public Group</h4>
                  <p>No public groups</p>
                  <h4>Join Group</h4>
                  <input
                    type="text"
                    value={groupIdInput}
                    onChange={(e) => setGroupIdInput(e.target.value)}
                    placeholder="Enter group ID"
                  />
                  <button onClick={joinGroup}>Join</button>
                  <h4>Group List</h4>
                  {groups.map(group => (
                    <div key={group.id} className="message clickable" onClick={() => setSelectedChat(group.id)}>
                      {group.name} (Members: {group.members.length})
                      <button onClick={() => leaveGroup(group.id)} style={{ marginLeft: '10px', padding: '2px 8px' }}>Leave</button>
                    </div>
                  ))}
                </>
              )}
              {(friends.length === 0 && groups.length === 0) && (
                <p>No friends or groups yet. Add a friend or create a group to start chatting!</p>
              )}
            </div>
            <div className="chat-window">
              <div className="message-list">
                <p>Welcome, {walletAddress.slice(0, 10)}...</p>
                {selectedChat ? (
                  messages.map((msg, index) => (
                    <div key={index} className="message">
                      {msg.sender === walletAddress ? 'You' : (groups.some(g => g.id === selectedChat) ? 'Group Member' : selectedChat.slice(0, 6))}: {msg.text} - {new Date(msg.timestamp).toLocaleTimeString()}
                    </div>
                  ))
                ) : (
                  <p>Select a friend or group to start chatting</p>
                )}
              </div>
              {selectedChat && (
                <div style={{ display: 'flex', gap: '10px', padding: '10px' }}>
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Enter message"
                    style={{ flex: 1 }}
                  />
                  <button onClick={sendMessage}>Send</button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default App;