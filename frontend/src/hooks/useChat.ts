import React, { useState, useCallback } from "react";
import { socket } from "../services/socket";
import { encryptAES } from "../crypto/aes_wasm";
import { db } from "../services/db";
import { useLiveQuery } from "dexie-react-hooks";
import toast from "react-hot-toast";
import { ratchetKey } from "../crypto/ratchet";

export function useChat(
  user: string,
  myPrivateKey: CryptoKey | null,
  getOrCreateSessionKey: (target: string) => Promise<string>,
) {
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const messages = useLiveQuery(() => db.messages.toArray()) || [];

  const sendMessage = useCallback(async () => {
    if (!input.trim() || !activeChat || !myPrivateKey || isSending) return;
    const targetUser = activeChat;
    const plaintext = input;
    setInput("");
    setIsSending(true);

    try {
      // 1. Get current key
      const currentAesKey = await getOrCreateSessionKey(targetUser);

      // 2. Encrypt the text using the WASM engine
      const ciphertext = await encryptAES(plaintext, currentAesKey);

      // 3. THE RATCHET: Hash the key immediately and save it for the NEXT message!
      const nextKey = await ratchetKey(currentAesKey);
      localStorage.setItem(`session_${user}_${targetUser}`, nextKey);

      // 4. Send over socket (Notice we DO NOT send an encryptedAesKey anymore!)
      const payload = {
        to: targetUser,
        from: user,
        ciphertext: ciphertext,
        type: "text",
      };

      socket.emit("private_message", payload);

      // 5. Save locally
      await db.messages.add({
        from: user,
        to: targetUser,
        decryptedText: plaintext,
        ciphertext,
        type: "text",
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("Encryption failed:", error);
      toast.error("Failed to send message.");
    } finally {
      setIsSending(false);
    }
  }, [input, activeChat, myPrivateKey, isSending, user, getOrCreateSessionKey]);

  const sendImage = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !activeChat || !myPrivateKey || isSending) return;
      const MAX_FILE_SIZE = 1 * 1024 * 1024;
      if (file.size > MAX_FILE_SIZE) {
        toast.error("Image is too large!");
        e.target.value = "";
        return;
      }
      const targetUser = activeChat;
      const reader = new FileReader();
      setIsSending(true);
      reader.onload = async (event) => {
        try {
          const base64Image = event.target?.result as string;
          const currentAesKey = await getOrCreateSessionKey(targetUser);
          const ciphertext = await encryptAES(base64Image, currentAesKey);

          // Ratchet after image too
          const nextKey = await ratchetKey(currentAesKey);
          localStorage.setItem(`session_${user}_${targetUser}`, nextKey);

          const blob = new Blob([ciphertext], { type: "text/plain" });
          const formData = new FormData();
          formData.append("encryptedFile", blob);
          const uploadRes = await fetch(
            `${import.meta.env.VITE_API_URL}/api/upload`,
            {
              method: "POST",
              body: formData,
            },
          );
          if (!uploadRes.ok) throw new Error("Upload failed.");
          const { url } = await uploadRes.json();
          const payload = {
            to: targetUser,
            from: user,
            ciphertext: url,
            type: "image",
          };
          socket.emit("private_message", payload);
          await db.messages.add({
            from: user,
            to: targetUser,
            decryptedText: base64Image,
            ciphertext,
            type: "image",
            timestamp: Date.now(),
          });
        } catch (err) {
          console.error("Image failed:", err);
          toast.error("Failed to send image.");
        } finally {
          setIsSending(false);
        }
      };
      reader.readAsDataURL(file);
    },
    [activeChat, myPrivateKey, isSending, user, getOrCreateSessionKey],
  );

  return {
    activeChat,
    setActiveChat,
    input,
    setInput,
    previewImage,
    setPreviewImage,
    messages,
    sendMessage,
    sendImage,
    isSending,
  };
}
