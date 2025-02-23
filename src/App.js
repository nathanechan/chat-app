import React, { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import Peer from 'simple-peer';
import {
  addChat, getChats, clearChats, addFriend, getFriends, removeFriend,
  addRequest, getRequests, updateRequest, addGroup, getGroups, joinGroup,
  leaveGroup, removeMember, addGroupChat, getGroupChats, clearGroupChats
} from './db';
import './App.css';

function App() {
  const [walletAddress, setWalletAddress] = useState(localStorage.getItem('walletAddress') || null);
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [friendAddressInput, setFriendAddressInput] = useState('');
  const [groupNameInput, setGroupNameInput] = useState('');
  const [groupIdInput, setGroupIdInput] = useState('');
  const [isPublicGroup, setIsPublicGroup] = useState(true);
  const [peers, setPeers] = useState({});
  const peerRef = useRef({});

  useEffect(() => {
    if (walletAddress) {
      loadFriends();
      loadRequests();
      loadGroups();
      if (selectedFriend) loadChats(selectedFriend);
      if (selectedGroup) loadGroupChats(selectedGroup);
    }
  }, [walletAddress, selectedFriend, selectedGroup]);

  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        const signer = provider.getSigner();
        const address = await signer.getAddress();
        setWalletAddress(address);
        localStorage.setItem('walletAddress', address);
      } catch (error) {
        alert("Failed to connect wallet: " + error.message);
      }
    } else {
      alert("Please install MetaMask!");
    }
  };

  const disconnectWallet = () => {
    setWalletAddress(null);
    localStorage.clear();
    clearChats();
    clearGroupChats();
    setMessages([]);
    setFriends([]);
    setRequests([]);
    setGroups([]);
    setSelectedFriend(null);
    setSelectedGroup(null);
    Object.values(peerRef.current).forEach(peer => peer.destroy());
    setPeers({});
  };

  const loadFriends = async () => {
    const loadedFriends = await getFriends();
    setFriends(loadedFriends);
  };

  const loadRequests = async () => {
    const loadedRequests = await getRequests();
    setRequests(loadedRequests.filter(req => req.toAddress === walletAddress && req.status === 'pending'));
  };

  const loadGroups = async () => {
    const loadedGroups = await getGroups();
    setGroups(loadedGroups);
  };

  const loadChats = async (friendAddress) => {
    const loadedMessages = await getChats(friendAddress);
    setMessages(loadedMessages);
  };

  const loadGroupChats = async (groupId) => {
    const loadedMessages = await getGroupChats(groupId);
    setMessages(loadedMessages);
  };

  const sendMessage = async () => {
    if (input.trim()) {
      if (selectedFriend) {
        await addChat(selectedFriend, input, true);
        const peer = peers[selectedFriend];
        if (peer) {
          peer.send(JSON.stringify({ type: 'message', content: input, sender: walletAddress }));
        }
        loadChats(selectedFriend);
      } else if (selectedGroup) {
        await addGroupChat(selectedGroup, walletAddress, input);
        loadGroupChats(selectedGroup);
      }
      setInput('');
    }
  };

  const clearHistory = async () => {
    if (selectedFriend) {
      await clearChats();
    } else if (selectedGroup) {
      await clearGroupChats();
    }
    setMessages([]);
  };

  const addFriendRequest = async () => {
    if (friendAddressInput.trim() && friendAddressInput !== walletAddress) {
      await addRequest(walletAddress, friendAddressInput);
      setFriendAddressInput('');
      alert("Friend request sent! Please ask the other party to manually accept (communication pending).");
      initiatePeerConnection(friendAddressInput);
      loadRequests();
    }
  };

  const acceptRequest = async (requestId, fromAddress) => {
    await updateRequest(requestId, 'accepted');
    await addFriend(fromAddress, `User${fromAddress.slice(0, 6)}`);
    initiatePeerConnection(fromAddress);
    loadFriends();
    loadRequests();
  };

  const rejectRequest = async (requestId) => {
    await updateRequest(requestId, 'rejected');
    loadRequests();
  };

  const deleteFriend = async (address) => {
    await removeFriend(address);
    if (peers[address]) {
      peers[address].destroy();
      setPeers(prev => { const newPeers = { ...prev }; delete newPeers[address]; return newPeers; });
    }
    loadFriends();
    if (selectedFriend === address) setSelectedFriend(null);
  };

  const createGroup = async () => {
    if (groupNameInput.trim()) {
      const groupId = `${walletAddress}-${Date.now()}`;
      await addGroup(groupId, groupNameInput, isPublicGroup, walletAddress);
      setGroupNameInput('');
      loadGroups();
    }
  };

  const joinGroupHandler = async () => {
    if (groupIdInput.trim()) {
      await joinGroup(groupIdInput, walletAddress);
      setGroupIdInput('');
      loadGroups();
    }
  };

  const leaveGroupHandler = async (groupId) => {
    await leaveGroup(groupId, walletAddress);
    loadGroups();
    if (selectedGroup === groupId) setSelectedGroup(null);
  };

  const kickMember = async (groupId, memberAddress) => {
    await removeMember(groupId, memberAddress, walletAddress);
    loadGroups();
    if (selectedGroup === groupId) loadGroupChats(groupId);
  };

  const initiatePeerConnection = (friendAddress) => {
    const peer = new Peer({ initiator: true, trickle: false });
    peer.on('signal', data => {
      console.log(`Send this signaling data to ${friendAddress}:`, JSON.stringify(data));
      alert(`Please manually send this signaling data to ${friendAddress}:\n${JSON.stringify(data)}`);
    });
    peer.on('connect', () => {
      console.log(`Connected to ${friendAddress}`);
      setPeers(prev => ({ ...prev, [friendAddress]: peer }));
    });
    peer.on('data', data => {
      const msg = JSON.parse(data);
      if (msg.type === 'message') {
        addChat(friendAddress, msg.content, false);
        loadChats(friendAddress);
      }
    });
    peerRef.current[friendAddress] = peer;
  };

  const connectToPeer = (signalData, friendAddress) => {
    const peer = new Peer({ initiator: false, trickle: false });
    peer.signal(signalData);
    peer.on('signal', data => {
      console.log(`Reply with this signaling data to ${friendAddress}:`, JSON.stringify(data));
      alert(`Please manually reply with this signaling data to ${friendAddress}:\n${JSON.stringify(data)}`);
    });
    peer.on('connect', () => {
      console.log(`Connected to ${friendAddress}`);
      setPeers(prev => ({ ...prev, [friendAddress]: peer }));
    });
    peer.on('data', data => {
      const msg = JSON.parse(data);
      if (msg.type === 'message') {
        addChat(friendAddress, msg.content, false);
        loadChats(friendAddress);
      }
    });
    peerRef.current[friendAddress] = peer;
  };

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
                <input
                  type="text"
                  value={friendAddressInput}
                  onChange={(e) => setFriendAddressInput(e.target.value)}
                  placeholder="Enter friend wallet address"
                />
                <button onClick={addFriendRequest}>Add Friend</button>
                <button onClick={() => {
                  const signal = prompt("Enter signaling data from the other party:");
                  if (signal) connectToPeer(JSON.parse(signal), friendAddressInput);
                }}>Connect to Friend</button>
              </div>
              <h4>Friend Requests</h4>
              {requests.length > 0 ? requests.map(req => (
                <div key={req.id} className="message">
                  <p>{req.fromAddress.slice(0, 10)}... wants to add you</p>
                  <button onClick={() => acceptRequest(req.id, req.fromAddress)}>Accept</button>
                  <button onClick={() => rejectRequest(req.id)}>Reject</button>
                </div>
              )) : <p>No requests</p>}
              <h4>Friend List</h4>
              {friends.length > 0 ? friends.map(friend => (
                <div key={friend.address} className="message">
                  <p onClick={() => { setSelectedFriend(friend.address); setSelectedGroup(null); }}>
                    {friend.name}
                  </p>
                  <button onClick={() => deleteFriend(friend.address)}>Delete</button>
                </div>
              )) : <p>No friends</p>}
              <h4>Create Group</h4>
              <input
                type="text"
                value={groupNameInput}
                onChange={(e) => setGroupNameInput(e.target.value)}
                placeholder="Enter group name"
              />
              <label>
                <input
                  type="checkbox"
                  checked={isPublicGroup}
                  onChange={(e) => setIsPublicGroup(e.target.checked)}
                />
                Public Group
              </label>
              <button onClick={createGroup}>Create</button>
              <h4>Join Group</h4>
              <input
                type="text"
                value={groupIdInput}
                onChange={(e) => setGroupIdInput(e.target.value)}
                placeholder="Enter group ID"
              />
              <button onClick={joinGroupHandler}>Join</button>
              <h4>Group List</h4>
              {groups.length > 0 ? groups.map(group => (
                <div key={group.id} className="message">
                  <p onClick={() => { setSelectedGroup(group.id); setSelectedFriend(null); }}>
                    {group.name} ({group.isPublic ? 'Public' : 'Private'})
                  </p>
                  <button onClick={() => leaveGroupHandler(group.id)}>Leave</button>
                </div>
              )) : <p>No groups</p>}
            </div>
            <div className="chat-window">
              <div className="message-list">
                <p>Welcome, {walletAddress}!</p>
                {selectedFriend ? (
                  messages.map((msg) => (
                    <div key={msg.id} className="message">
                      {msg.isSent ? 'You' : selectedFriend.slice(0, 6)}: {msg.message} - {new Date(msg.timestamp).toLocaleTimeString()}
                    </div>
                  ))
                ) : selectedGroup ? (
                  <>
                    {messages.map((msg) => (
                      <div key={msg.id} className="message">
                        {msg.sender === walletAddress ? 'You' : msg.sender.slice(0, 6)}: {msg.message} - {new Date(msg.timestamp).toLocaleTimeString()}
                      </div>
                    ))}
                    {groups.find(g => g.id === selectedGroup)?.creator === walletAddress && (
                      <div>
                        <h4>Manage Members</h4>
                        {groups.find(g => g.id === selectedGroup)?.members.map(member => (
                          member !== walletAddress && (
                            <p key={member} className="message">
                              {member.slice(0, 10)}... <button onClick={() => kickMember(selectedGroup, member)}>Kick</button>
                            </p>
                          )
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p>Select a friend or group to start chatting</p>
                )}
              </div>
              {(selectedFriend || selectedGroup) && (
                <div style={{ display: 'flex', gap: '10px', padding: '10px' }}>
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Enter message"
                    style={{ flex: 1 }}
                  />
                  <button onClick={sendMessage}>Send</button>
                  <button onClick={clearHistory}>Clear History</button>
                </div>
              )}
            </div>
            <div className="header">
              <button onClick={disconnectWallet}>Logout</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default App;