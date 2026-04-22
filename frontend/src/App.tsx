import { useState, useEffect } from 'react';
import LoginForm from './components/LoginForm';
import { socket } from './services/socket';
import { encryptAES, decryptAES } from './crypto/aes_wasm';
import { generateRSAKeyPair, exportPublicKey, importPublicKey, decryptWithPrivateKey, encryptWithPublicKey } from './crypto/rsa';
import { generateDynamicAESKey } from './services/utils';
import srp from 'secure-remote-password/client';
import { db } from './services/db';
import { useLiveQuery } from 'dexie-react-hooks';
import toast, { Toaster } from 'react-hot-toast';

interface MessagePayload {
  from: string;
  to: string;
  ciphertext: string;
  decryptedText?: string; 
  encryptedAesKey?: string;
}

export default function App() {
  const [user, setUser] = useState(localStorage.getItem('currentUser') || '');
  const [myPrivateKey, setMyPrivateKey] = useState<CryptoKey | null>(null);
  const messages = useLiveQuery(() => db.messages.toArray()) || [];

  const [input, setInput] = useState('');
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [pendingRequests, setPendingRequests] = useState<string[]>([]);
  const [sentRequests, setSentRequests] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [friendsList, setFriendsList] = useState<string[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
  const [showBlockPanel, setShowBlockPanel] = useState(false);

  const recentChats = Array.from(new Set(messages.map(msg => msg.from === user ? msg.to : msg.from).filter(Boolean)));

const handleLogin = async (username: string, password: string, isRegistering: boolean) => {
  try {
    if (isRegistering) {
      // Generate SRP credentials
      const salt = srp.generateSalt();
      const privateKey = srp.derivePrivateKey(salt, username, password);
      const verifier = srp.deriveVerifier(privateKey);

      // Generate RSA key pair
      const keys = await generateRSAKeyPair();
      const base64PublicKey = await exportPublicKey(keys.publicKey);

      // Send public key and SRP proofs to server
      const res = await fetch('http://localhost:3000/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username, 
          publicKey: base64PublicKey,
          srpSalt: salt,
          srpVerifier: verifier
        })
      });

      if (!res.ok) throw new Error("Username taken or database error");
      
      // Store private RSA key locally
      setMyPrivateKey(keys.privateKey);
      const exportedPrivate = await window.crypto.subtle.exportKey("pkcs8", keys.privateKey);
      const base64PrivateKey = btoa(String.fromCharCode(...new Uint8Array(exportedPrivate)));
      localStorage.setItem(`privateKey_${username}`, base64PrivateKey);
      

      
    } else {


      const clientEphemeral = srp.generateEphemeral();

      // Request SRP challenge from server
      const challengeRes = await fetch('http://localhost:3000/api/login/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          clientEphemeralPublic: clientEphemeral.public
        })
      });

      if (!challengeRes.ok) throw new Error("User not found.");
      const { salt, serverEphemeralPublic } = await challengeRes.json();


      
      // Derive session proof locally
      const privateKey = srp.derivePrivateKey(salt, username, password);
      const clientSession = srp.deriveSession(
        clientEphemeral.secret,
        serverEphemeralPublic,
        salt,
        username,
        privateKey
      );


      
      // Verify proof with server
      const verifyRes = await fetch('http://localhost:3000/api/login/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          clientEphemeralPublic: clientEphemeral.public,
          clientSessionProof: clientSession.proof
        })
      });

      if (!verifyRes.ok) throw new Error("Invalid password! Cryptographic handshake failed.");



      // Load RSA private key from local storage
      const savedKeyBase64 = localStorage.getItem(`privateKey_${username}`);
      if (!savedKeyBase64) {
         console.warn("Logged in, but RSA Private Key missing from this device. You will not be able to decrypt messages.");
      } else {
         const binaryDerString = window.atob(savedKeyBase64);
         const binaryDer = new Uint8Array(binaryDerString.length);
         for (let i = 0; i < binaryDerString.length; i++) {
             binaryDer[i] = binaryDerString.charCodeAt(i);
         }
         
         const loadedKey = await window.crypto.subtle.importKey(
             "pkcs8",
             binaryDer.buffer,
             { name: "RSA-OAEP", hash: "SHA-256" },
             true,
             ["decrypt"]
         );
         
         setMyPrivateKey(loadedKey);
      }
    }

    // Connect socket
    localStorage.setItem('currentUser', username);
    setUser(username);
    socket.connect();
  } catch (err: any) {
    toast.error(err.message);
  }
};
  useEffect(() => {
    if (searchQuery.trim().length === 0) {
      setSearchResults([]);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      try {
        const res = await fetch(`http://localhost:3000/api/users/search?q=${searchQuery}&current_user=${user}`);
        
        if (!res.ok) {
          setSearchResults([]);
          return;
        }

        const data = await res.json();
        if (Array.isArray(data)) {
          setSearchResults(data);
        } else {
          setSearchResults([]);
        }
      } catch (err) {
        console.error("Search failed", err);
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, user]);

  // Register socket after identity is verified
  useEffect(() => {
    if (user && myPrivateKey) {
      console.log(`[Status] Identity verified. Key loaded. Registering socket for ${user}...`);
      socket.emit('register_socket', user);
    }
  }, [user, myPrivateKey]);

  // Incoming message listener and social data fetching
  useEffect(() => {
    // Fetch pending incoming requests
    fetch(`http://localhost:3000/api/request/pending/${user}`)
      .then(res => res.json())
      .then(data => { if (data.requests) setPendingRequests(data.requests); });

    // Fetch sent outgoing requests
    fetch(`http://localhost:3000/api/request/sent/${user}`)
      .then(res => res.json())
      .then(data => { if (data.requests) setSentRequests(data.requests); });

    // Fetch friends list
    fetch(`http://localhost:3000/api/friends/${user}`)
      .then(res => res.json())
      .then(data => { if (data.friends) setFriendsList(data.friends); });

    // Fetch blocked users
    fetch(`http://localhost:3000/api/blocked/${user}`)
      .then(res => res.json())
      .then(data => { if (data.blocked) setBlockedUsers(data.blocked); });

    // Real-time socket listeners
    socket.on('receive_friend_request', (senderUsername: string) => {
      setPendingRequests(prev => {
        if (!prev.includes(senderUsername)) return [...prev, senderUsername];
        return prev;
      });
    });

    socket.on('request_accepted', (receiverUsername: string) => {
      toast.success(`${receiverUsername} accepted your friend request!`);
      setSentRequests(prev => prev.filter(u => u !== receiverUsername));
      setFriendsList(prev => {
        if (!prev.includes(receiverUsername)) return [...prev, receiverUsername];
        return prev;
      });
    });

    socket.on('request_rejected', (receiverUsername: string) => {
      toast.error(`${receiverUsername} declined your friend request.`);
      setSentRequests(prev => prev.filter(u => u !== receiverUsername));
    });

    socket.on('user_blocked_you', (blockerUsername: string) => {
      setFriendsList(prev => prev.filter(u => u !== blockerUsername));
      setPendingRequests(prev => prev.filter(u => u !== blockerUsername));
      setSentRequests(prev => prev.filter(u => u !== blockerUsername));
      if (activeChat === blockerUsername) setActiveChat(null);
    });

    socket.on('receive_message', async (payload: any) => {
      console.log(`📥 Incoming encrypted payload from ${payload.from}...`);
      try {
        if (!myPrivateKey) { console.error("Private Key not loaded."); return; }
        const decryptedAesKey = await decryptWithPrivateKey(myPrivateKey, payload.encryptedAesKey);
        let actualCiphertext = payload.ciphertext;
        if (payload.type === 'image') {
          const res = await fetch(payload.ciphertext);
          actualCiphertext = await res.text();
        }
        const plaintext = await decryptAES(actualCiphertext, decryptedAesKey);
        await db.messages.add({
          from: payload.from, to: user, decryptedText: plaintext,
          ciphertext: payload.ciphertext, type: payload.type || 'text', timestamp: Date.now()
        });
      } catch (error) { console.error("Failed to decrypt:", error); }
    });

    return () => {
      socket.off('receive_message');
      socket.off('receive_friend_request');
      socket.off('request_accepted');
      socket.off('request_rejected');
      socket.off('user_blocked_you');
    };
  }, [myPrivateKey, user]);

  // Social system handlers
  const searchUsers = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) return setSearchResults([]);
    try {
      const res = await fetch(`http://localhost:3000/api/users/search/${query}?current_user=${user}`);
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setSearchResults(data.users || []);
    } catch (err) {
      console.error("Search Error:", err);
      setSearchResults([]);
    }
  };

  const sendRequest = async (targetUser: string) => {
    if (targetUser === user) return toast.error("You cannot add yourself!");
    try {
      const res = await fetch('http://localhost:3000/api/request/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: user, receiver: targetUser })
      });
      const data = await res.json();
      if (!res.ok) return toast.error(data.error || "Failed to send request.");
      socket.emit('send_friend_request', { sender: user, receiver: targetUser });
      setSentRequests(prev => [...prev, targetUser]);
      setSearchResults([]); setSearchQuery("");
      toast.success(`Request sent to ${targetUser}`);
    } catch (err) { toast.error("Failed to send request."); }
  };

  const acceptRequest = async (requester: string) => {
    try {
      await fetch('http://localhost:3000/api/request/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: requester, receiver: user })
      });
      socket.emit('accept_friend_request', { sender: requester, receiver: user });
      setPendingRequests(prev => prev.filter(r => r !== requester));
      setFriendsList(prev => [...prev, requester]);
      toast.success(`You are now friends with ${requester}!`);
    } catch (err) { toast.error("Failed to accept request."); }
  };

  const rejectRequest = async (requester: string) => {
    try {
      await fetch('http://localhost:3000/api/request/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: requester, receiver: user })
      });
      socket.emit('reject_friend_request', { sender: requester, receiver: user });
      setPendingRequests(prev => prev.filter(r => r !== requester));
      toast.success(`Request from ${requester} rejected.`);
    } catch (err) { toast.error("Failed to reject request."); }
  };

  const blockUser = async (targetUser: string) => {
    try {
      const res = await fetch('http://localhost:3000/api/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocker: user, blocked: targetUser })
      });
      const data = await res.json();
      if (!res.ok) return toast.error(data.error);
      socket.emit('block_user', { blocker: user, blocked: targetUser });
      setBlockedUsers(prev => [...prev, targetUser]);
      setFriendsList(prev => prev.filter(u => u !== targetUser));
      setPendingRequests(prev => prev.filter(u => u !== targetUser));
      setSentRequests(prev => prev.filter(u => u !== targetUser));
      if (activeChat === targetUser) setActiveChat(null);
      toast.success(`${targetUser} has been blocked.`);
    } catch (err) { toast.error("Failed to block user."); }
  };

  const unblockUser = async (targetUser: string) => {
    try {
      await fetch('http://localhost:3000/api/unblock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocker: user, blocked: targetUser })
      });
      setBlockedUsers(prev => prev.filter(u => u !== targetUser));
      toast.success(`${targetUser} has been unblocked.`);
    } catch (err) { toast.error("Failed to unblock user."); }
  };

  // Helper: get relationship status for search results
  const getRelationship = (username: string) => {
    if (friendsList.includes(username)) return 'friend';
    if (sentRequests.includes(username)) return 'sent';
    if (pendingRequests.includes(username)) return 'pending';
    return 'none';
  };
  const sendMessage = async () => {
    if (!input.trim() || !activeChat) return; 


    const targetUser = activeChat;

    try {
      socket.emit('request_public_key', targetUser, async (response: any) => {
        if (!response.success) {
          toast.error(response.error);
          return;
        }

        const targetPublicKey = await importPublicKey(response.publicKey);
        const dynamicAesKey = generateDynamicAESKey();
        const ciphertext = await encryptAES(input, dynamicAesKey);
        const encryptedAesKey = await encryptWithPublicKey(targetPublicKey, dynamicAesKey);

        const payload = {
          to: targetUser, 
          from: user,
          ciphertext: ciphertext,
          encryptedAesKey: encryptedAesKey,
        };

        socket.emit('private_message', payload);

        await db.messages.add({
          from: user,
          to: targetUser,
          decryptedText: input,
          ciphertext: ciphertext,
          type: 'text',
          timestamp: Date.now()
        });
        
        setInput('');
      });
    } catch (error) {
      console.error("Encryption failed:", error);
    }
  };

  // Encrypted image upload
  const sendImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeChat) return;

    // Check file size (1MB max)
    const MAX_FILE_SIZE = 1 * 1024 * 1024; 
    if (file.size > MAX_FILE_SIZE) {
      toast.error("Image is too large! Please select an image under 1MB to prevent memory crashes.");
      e.target.value = '';
      return;
    }
    
    const targetUser = activeChat;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const base64Image = event.target?.result as string;

        socket.emit('request_public_key', targetUser, async (response: any) => {
          if (!response.success) return toast.error("Could not get target public key.");
          
          const targetPublicKey = await importPublicKey(response.publicKey);
          const dynamicAesKey = generateDynamicAESKey();
          
          const ciphertext = await encryptAES(base64Image, dynamicAesKey);
          const encryptedAesKey = await encryptWithPublicKey(targetPublicKey, dynamicAesKey);

          // Upload encrypted blob
          const blob = new Blob([ciphertext], { type: 'text/plain' });
          const formData = new FormData();
          formData.append('encryptedFile', blob);

          const uploadRes = await fetch('http://localhost:3000/api/upload', {
            method: 'POST',
            body: formData
          });
          
          if (!uploadRes.ok) throw new Error("Upload failed. File might be too large.");
          const { url } = await uploadRes.json();

          const payload = {
            to: targetUser,
            from: user,
            ciphertext: url,
            encryptedAesKey: encryptedAesKey,
            type: 'image'
          };

          socket.emit('private_message', payload);

          await db.messages.add({
            from: user,
            to: targetUser,
            decryptedText: base64Image,
            ciphertext: ciphertext,
            type: 'image',
            timestamp: Date.now()
          });
        });
      } catch (err) {
        console.error("Image processing failed:", err);
      }
    };
    reader.readAsDataURL(file);
  };

  if (!user) return <LoginForm onLogin={handleLogin} />;

  return (

    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-8 font-sans">
      <Toaster position="top-right" reverseOrder={false} />

      <div className="w-full max-w-6xl bg-white shadow-2xl rounded-2xl overflow-hidden flex h-[85vh] border border-gray-200">
        
        {/* Sidebar */}
        <div className="w-1/4 max-w-sm bg-gray-50 border-r border-gray-200 flex flex-col z-10">
          

          <div className="p-5 bg-indigo-600 text-white flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Project Cipher</h2>
              <p className="text-xs text-indigo-200 mt-1 flex items-center gap-1">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                {user}
              </p>
            </div>
            <button onClick={() => setShowBlockPanel(!showBlockPanel)} className="p-2 hover:bg-indigo-700 rounded-lg transition" title="Settings">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            </button>
          </div>


          {showBlockPanel && (
            <div className="m-4 p-3 bg-red-50 rounded-xl border border-red-200 shadow-sm">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-xs font-bold text-red-800 uppercase tracking-wider">Blocked Users</h3>
                <button onClick={() => setShowBlockPanel(false)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
              </div>
              {blockedUsers.length === 0 ? (
                <p className="text-xs text-red-400 italic">No blocked users.</p>
              ) : (
                blockedUsers.map(blockedName => (
                  <div key={blockedName} className="flex justify-between items-center mb-2 bg-white p-2 rounded-lg border border-red-100">
                    <span className="font-medium text-sm text-gray-700">{blockedName}</span>
                    <button onClick={() => unblockUser(blockedName)} className="px-3 py-1 bg-green-600 text-white text-xs font-bold rounded-md hover:bg-green-700 transition">Unblock</button>
                  </div>
                ))
              )}
            </div>
          )}


          {pendingRequests.length > 0 && (
            <div className="m-4 p-3 bg-indigo-50 rounded-xl border border-indigo-200 shadow-sm">
              <h3 className="text-xs font-bold text-indigo-800 uppercase tracking-wider mb-2">Incoming Requests</h3>
              {pendingRequests.map(requester => (
                <div key={requester} className="flex justify-between items-center mb-2 bg-white p-2 rounded-lg border border-indigo-100">
                  <span className="font-medium text-sm text-gray-700">{requester}</span>
                  <div className="flex gap-1">
                    <button onClick={() => acceptRequest(requester)} className="px-2 py-1 bg-indigo-600 text-white text-xs font-bold rounded-md hover:bg-indigo-700 transition">Accept</button>
                    <button onClick={() => rejectRequest(requester)} className="px-2 py-1 bg-red-500 text-white text-xs font-bold rounded-md hover:bg-red-600 transition">Reject</button>
                  </div>
                </div>
              ))}
            </div>
          )}


          {sentRequests.length > 0 && (
            <div className="mx-4 mb-4 p-3 bg-amber-50 rounded-xl border border-amber-200 shadow-sm">
              <h3 className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-2">Awaiting Response</h3>
              {sentRequests.map(target => (
                <div key={target} className="flex justify-between items-center mb-2 bg-white p-2 rounded-lg border border-amber-100">
                  <span className="font-medium text-sm text-gray-700">{target}</span>
                  <span className="text-xs text-amber-600 font-medium px-2 py-1 bg-amber-100 rounded-md">Pending...</span>
                </div>
              ))}
            </div>
          )}


          <div className="p-4 border-b border-gray-200 bg-white relative">
            <input 
              type="text"
              placeholder="Search global network..."
              value={searchQuery}
              onChange={(e) => searchUsers(e.target.value)}
              className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm transition-all"
            />
            

            {searchResults.length > 0 && (
              <div className="absolute left-4 right-4 top-14 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden">
                {searchResults.map(result => {
                  const rel = getRelationship(result.username);
                  return (
                    <div key={result.username} className="flex justify-between items-center p-3 hover:bg-gray-50 border-b last:border-0">
                      <span className="text-sm font-medium text-gray-800">{result.username}</span>
                      {rel === 'friend' ? (
                        <span className="text-xs text-green-600 font-medium px-2 py-1 bg-green-50 rounded-md">✓ Friends</span>
                      ) : rel === 'sent' ? (
                        <span className="text-xs text-amber-600 font-medium px-2 py-1 bg-amber-50 rounded-md">Pending...</span>
                      ) : rel === 'pending' ? (
                        <button onClick={() => acceptRequest(result.username)} className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-md hover:bg-indigo-700 transition font-medium">Accept</button>
                      ) : (
                        <button onClick={() => sendRequest(result.username)} className="text-xs bg-gray-800 text-white px-3 py-1.5 rounded-md hover:bg-black transition font-medium">Invite</button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>


          <div className="flex-1 overflow-y-auto p-2 bg-white">
            {friendsList.length > 0 ? (
              <div className="space-y-1">
                <p className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Secure Channels</p>
                {friendsList.map((chatUsername) => (
                  <div key={chatUsername} className="group flex items-center gap-0">
                    <button
                      onClick={() => setActiveChat(chatUsername)}
                      className={`flex-1 text-left px-4 py-3 rounded-lg transition-colors flex items-center gap-3 ${
                        activeChat === chatUsername ? 'bg-indigo-50 border border-indigo-100' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="h-10 w-10 bg-gray-100 text-gray-600 border border-gray-200 rounded-full flex items-center justify-center font-bold text-lg shrink-0">
                        {chatUsername.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className={`font-medium truncate ${activeChat === chatUsername ? 'text-indigo-700' : 'text-gray-800'}`}>{chatUsername}</p>
                        <p className="text-[10px] text-green-500 font-medium uppercase tracking-wider">Encrypted Link Active</p>
                      </div>
                    </button>
                    <button onClick={() => blockUser(chatUsername)} className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-300 hover:text-red-500 transition-all mr-1 shrink-0" title={`Block ${chatUsername}`}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"></path></svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
               <div className="h-full flex flex-col items-center justify-center text-gray-400 p-8 text-center">
                 <svg className="w-10 h-10 mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                 <p className="text-sm">Search the database to find users and establish a connection.</p>
               </div>
            )}
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col bg-[#FAFAFA]">
          
          {activeChat ? (
            <>

              <div className="h-20 px-6 border-b border-gray-200 bg-white flex items-center justify-between shadow-sm z-0">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold text-lg shadow-sm">
                    {activeChat.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{activeChat}</h3>
                    <p className="text-xs text-green-600 font-medium flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                      AES-256 / RSA-2048 Secured
                    </p>
                  </div>
                </div>
              </div>


              <div className="flex-1 p-6 overflow-y-auto">
                {messages.filter(m => m.to === activeChat || m.from === activeChat).length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-3">
                    <div className="p-4 bg-gray-100 rounded-full">
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                    </div>
                    <p>Send a message to initiate the Hybrid Key Exchange.</p>
                  </div>
                ) : (
                  messages
                    .filter(m => m.to === activeChat || m.from === activeChat)
                    .map((msg, i) => {
                      const isMe = msg.from === user;
                      return (
                        <div key={i} className={`mb-6 flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                          <div className={`px-2 py-2 rounded-2xl max-w-[70%] shadow-sm ${
                            isMe ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none'
                          }`}>
                            {msg.type === 'image' ? (
                              <img 
                                src={msg.decryptedText} 
                                alt="Secure shared" 
                                onClick={() => setPreviewImage(msg.decryptedText)}
                                className="max-w-full max-h-[250px] rounded-xl object-contain block mx-auto cursor-zoom-in hover:opacity-90 transition-opacity"
                                loading="lazy"
                              />
                            ) : (
                              <p className="text-sm px-3 py-1">{msg.decryptedText}</p>
                            )}
                          </div>
                          <div className="mt-1 flex items-center gap-1 text-[10px] text-gray-400 max-w-[70%]">
                            <span className="truncate">Ciphertext: {msg.ciphertext.substring(0, 16)}...</span>
                          </div>
                        </div>
                      );
                  })
                )}
              </div>


              <div className="p-4 bg-white border-t border-gray-200">
                <div className="flex gap-3 items-center max-w-4xl mx-auto">
                  

                  <input 
                    type="file" 
                    accept="image/*" 
                    id="image-upload" 
                    className="hidden" 
                    onChange={sendImage} 
                  />
                  <label 
                    htmlFor="image-upload" 
                    className="p-3 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-xl cursor-pointer transition-colors"
                    title="Send Encrypted Image"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg>
                  </label>


                  <input 
                    placeholder={`Secure message to ${activeChat}...`}
                    value={input} 
                    onChange={e => setInput(e.target.value)} 
                    onKeyDown={e => e.key === 'Enter' && sendMessage()}
                    className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 rounded-xl transition-all outline-none text-gray-700 placeholder-gray-400" 
                  />
                  <button 
                    onClick={sendMessage} 
                    className="p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md hover:shadow-lg transition-all"
                  >
                    <svg className="w-6 h-6 transform rotate-45 -mt-1 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 text-gray-400">
              <svg className="w-20 h-20 mb-4 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
              <h2 className="text-xl font-medium text-gray-500 mb-2">No connection selected</h2>
              <p className="text-sm">Search for a user in the sidebar to open a secure channel.</p>
            </div>
          )}
        </div>

      </div>

      {/* Image preview modal */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => setPreviewImage(null)}
        >
          <button 
            className="absolute top-6 right-6 text-white hover:text-gray-300 transition-colors p-2 bg-white/10 rounded-full"
            onClick={() => setPreviewImage(null)}
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          
          <img 
            src={previewImage} 
            alt="Preview" 
            className="max-w-full max-h-full rounded-lg shadow-2xl animate-in zoom-in-95 duration-300 object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          
          <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/60 text-sm font-medium tracking-wide bg-black/20 px-4 py-2 rounded-full backdrop-blur-md">
            Secure Encrypted Preview
          </p>
        </div>
      )}
    </div>
  );
}