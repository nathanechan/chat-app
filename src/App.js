import React, { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import Peer from 'simple-peer';
import { 
  db, rdb 
} from './firebase';
import { 
  collection, addDoc, getDocs, doc, setDoc, onSnapshot, updateDoc, arrayUnion
} from 'firebase/firestore';
import { 
  ref as rdbRef, set, onValue, onDisconnect 
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
      await setDoc(doc(db, 'friends', `${walletAddress}_${friendAddressInput}`), {
        user1: walletAddress,
        user2: friendAddressInput,
        status: 'pending',
      });
      setFriendAddressInput('');
      alert("Friend request sent!");
    }
  };

  // 获取好友列表
  const loadFriends = () => {
    return onSnapshot(collection(db, 'friends'), (querySnapshot) => {
      const friendList = querySnapshot.docs
        .filter(doc => doc.data().user1 === walletAddress || doc.data().user2 === walletAddress)
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
      const signalingRef = rdbRef(rdb, `signaling/${walletAddress}_${targetAddress}${isGroup ? '_group' : ''}`);
      set(signalingRef, data);
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

    const signalingPath = isGroup ? `signaling/${targetAddress}_${walletAddress}_group` : `signaling/${targetAddress}_${walletAddress}`;
    onValue(rdbRef(rdb, signalingPath), (snapshot) => {
      const signalData = snapshot.val();
      if (signalData && peer) {
        peer.signal(signalData);
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
      if (peer) {
        peer.send(JSON.stringify(message));
      }
      setInput('');
    }
  };

  // 本地存储对话
  const storeMessage = (userId, message, targetId) => {
    const key = `messages_${userId}_${targetId}`;
    const messages = JSON.parse(localStorage.getItem(key) || '[]');
    messages.push(message);
    localStorage.setItem(key, JSON.stringify(messages));
  };

  const getMessages = (userId, targetId) => {
    const key = `messages_${userId}_${targetId}`;
    return JSON.parse(localStorage.getItem(key) || '[]');
  };

  // 生命周期
  useEffect(() => {
    let unsubscribeFriends, unsubscribeGroups;
    if (walletAddress) {
      unsubscribeFriends = loadFriends();
      unsubscribeGroups = loadGroups();
      setOnlineStatus(walletAddress, true);
      getOnlineStatus(walletAddress);
    }
    return () => {
      unsubscribeFriends?.();
      unsubscribeGroups?.();
    };
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
              <p>No friend requests</p>
              <h4>Friend List</h4>
              {friends.length > 0 ? friends.map(friend => (
                <div key={friend} className="message" onClick={() => setSelectedChat(friend)}>
                  {friend.slice(0, 10)}... {isOnline ? '(Online)' : '(Offline)'}
                </div>
              )) : <p>No friends</p>}
              
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
              {groups.length > 0 ? groups.map(group => (
                <div key={group.id} className="message" onClick={() => setSelectedChat(group.id)}>
                  {group.name} (Members: {group.members.length})
                </div>
              )) : <p>No groups</p>}
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