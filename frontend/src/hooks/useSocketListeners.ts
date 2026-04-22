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
}: SocketListenersProps) {
  useEffect(() => {
    if (!user) return;

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
        if (payload.type === "image") {
          const res = await fetch(payload.ciphertext);
          actualCiphertext = await res.text();
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
        console.error(
          "Failed to decrypt incoming message (Ratchet sync?):",
          error,
        );
      }
    });

    return () => {
      socket.off("receive_message");
      socket.off("receive_friend_request");
      socket.off("request_accepted");
      socket.off("request_rejected");
      socket.off("user_blocked_you");
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
