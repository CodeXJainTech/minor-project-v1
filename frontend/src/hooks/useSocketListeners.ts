import React, { useEffect } from "react";
import { socket } from "../services/socket";
import { decryptAES } from "../crypto/aes_wasm";
import { db } from "../services/db";
import toast from "react-hot-toast";
import { ratchetKey } from "../crypto/ratchet";

interface SocketListenersProps {
  user: string;
  myPrivateKey: CryptoKey | null;
  activeChat: string | null;
  setActiveChat: (name: string | null) => void;
  setPendingRequests: React.Dispatch<React.SetStateAction<string[]>>;
  setSentRequests: React.Dispatch<React.SetStateAction<string[]>>;
  setFriendsList: React.Dispatch<React.SetStateAction<string[]>>;
  getOrCreateSessionKey: (target: string) => Promise<string>;
  setOnlineUsers: React.Dispatch<React.SetStateAction<string[]>>;
}

export function useSocketListeners({
  user,
  myPrivateKey,
  activeChat,
  setActiveChat,
  setPendingRequests,
  setSentRequests,
  setFriendsList,
  getOrCreateSessionKey,
  setOnlineUsers,
}: SocketListenersProps) {
  useEffect(() => {
    if (!user) return;

    socket.on("online_users", (users: string[]) => {
      setOnlineUsers(users);
    });

    socket.on("user_connected", (connectedUser: string) => {
      setOnlineUsers((prev) => 
        prev.includes(connectedUser) ? prev : [...prev, connectedUser]
      );
    });

    socket.on("user_disconnected", (disconnectedUser: string) => {
      setOnlineUsers((prev) => prev.filter(u => u !== disconnectedUser));
    });

    socket.on("receive_friend_request", (senderUsername: string) => {
      toast.success(`New friend request from ${senderUsername}!`);
      setPendingRequests((prev) =>
        prev.includes(senderUsername) ? prev : [...prev, senderUsername],
      );
    });

    socket.on("request_accepted", (receiverUsername: string) => {
      toast.success(`${receiverUsername} accepted your friend request!`);
      setSentRequests((prev) => prev.filter((u) => u !== receiverUsername));
      setFriendsList((prev) =>
        prev.includes(receiverUsername) ? prev : [...prev, receiverUsername],
      );
    });

    socket.on("request_rejected", (receiverUsername: string) => {
      toast.error(`${receiverUsername} declined your friend request.`);
      setSentRequests((prev) => prev.filter((u) => u !== receiverUsername));
    });

    socket.on("user_blocked_you", (blockerUsername: string) => {
      setFriendsList((prev) => prev.filter((u) => u !== blockerUsername));
      setPendingRequests((prev) => prev.filter((u) => u !== blockerUsername));
      setSentRequests((prev) => prev.filter((u) => u !== blockerUsername));
      if (activeChat === blockerUsername) setActiveChat(null);
    });

    socket.on("receive_message", async (payload: any) => {
      try {
        if (!myPrivateKey) return;

        // 1. Get current key
        const currentAesKey = await getOrCreateSessionKey(payload.from);

        let actualCiphertext = payload.ciphertext;
        if (payload.type === "image" || payload.type === "audio") {
          try {
            const res = await fetch(payload.ciphertext);
            if (!res.ok) {
              throw new Error(`Failed to fetch media: ${res.status} ${res.statusText} at ${payload.ciphertext}`);
            }
            actualCiphertext = await res.text();
            
            // Basic validation: ciphertext should be base64
            if (!actualCiphertext || actualCiphertext.length < 10) {
               throw new Error("Fetched media ciphertext is too short or empty.");
            }
          } catch (fetchError) {
            toast.error("Failed to fetch media message");
            throw fetchError; // Re-throw to be caught by the outer catch
          }
        }


        // 2. Decrypt the message
        const plaintext = await decryptAES(actualCiphertext, currentAesKey);

        // 3. THE RATCHET: Move the lock forward
        const nextKey = await ratchetKey(currentAesKey);
        localStorage.setItem(`session_${user}_${payload.from}`, nextKey);

        await db.messages.add({
          from: payload.from,
          to: user,
          decryptedText: plaintext,
          ciphertext: payload.ciphertext,
          type: payload.type || "text",
          timestamp: Date.now(),
        });
      } catch (error) {
        toast.error("Failed to decrypt incoming message.");
      }
    });

    return () => {
      socket.off("receive_message");
      socket.off("receive_friend_request");
      socket.off("request_accepted");
      socket.off("request_rejected");
      socket.off("user_blocked_you");
      socket.off("online_users");
      socket.off("user_connected");
      socket.off("user_disconnected");
    };
  }, [
    user,
    myPrivateKey,
    activeChat,
    setActiveChat,
    setPendingRequests,
    setSentRequests,
    setFriendsList,
    getOrCreateSessionKey,
  ]);
}
