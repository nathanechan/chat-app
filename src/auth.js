import { ethers } from 'ethers';
import { db } from './firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';

export const connectWallet = async () => {
  if (window.ethereum) {
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = provider.getSigner();
      const address = await signer.getAddress();
      // 存储或更新用户信息到 Firestore
      await setDoc(doc(db, 'users', address), {
        walletAddress: address,
        createdAt: new Date().toISOString(),
      }, { merge: true });
      return address;
    } catch (error) {
      console.error("Failed to connect wallet:", error);
      alert("Failed to connect wallet: " + error.message);
    }
  } else {
    alert("Please install MetaMask!");
  }
};

export const getUser = async (address) => {
  const docRef = doc(db, 'users', address);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? docSnap.data() : null;
};