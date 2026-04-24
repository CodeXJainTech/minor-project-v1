import React, { useState, useCallback } from "react";
import { socket } from "../services/socket";
import { encryptAES } from "../crypto/aes_wasm";
import { db } from "../services/db";
import { useLiveQuery } from "dexie-react-hooks";
import toast from "react-hot-toast";
import { ratchetKey } from "../crypto/ratchet";
import CryptoJS from "crypto-js";

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

      // 3. Compute HMAC for Integrity (Encrypt-then-MAC)
      const hmac = CryptoJS.HmacSHA256(ciphertext, currentAesKey).toString();

      // 4. THE RATCHET: Hash the key immediately and save it for the NEXT message!
      const nextKey = await ratchetKey(currentAesKey);
      localStorage.setItem(`session_${user}_${targetUser}`, nextKey);

      // 5. Send over socket
      const payload = {
        to: targetUser,
        from: user,
        ciphertext: ciphertext,
        type: "text",
        hmac: hmac,
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
      const MAX_FILE_SIZE = 10 * 1024 * 1024;
      if (file.size > MAX_FILE_SIZE) {
        toast.error("Image is too large (max 10MB)!");
        e.target.value = "";
        return;
      }
      const targetUser = activeChat;
      setIsSending(true);

      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.src = objectUrl;

      img.onload = async () => {
        URL.revokeObjectURL(objectUrl);
        try {
          const canvas = document.createElement("canvas");
          let width = img.width;
          let height = img.height;

          // Scale down if image is too large (max 1200x1200px)
          const MAX_WIDTH = 1200;
          const MAX_HEIGHT = 1200;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height = Math.round((height * MAX_WIDTH) / width);
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width = Math.round((width * MAX_HEIGHT) / height);
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, width, height);

          // Optimize image quality before encryption
          const optimizedBase64 = canvas.toDataURL("image/jpeg", 0.7);

          const currentAesKey = await getOrCreateSessionKey(targetUser);
          const ciphertext = await encryptAES(optimizedBase64, currentAesKey);

          // Compute HMAC over the actual image ciphertext before upload
          const hmac = CryptoJS.HmacSHA256(ciphertext, currentAesKey).toString();

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
            ciphertext: url, // url to fetch the ciphertext
            type: "image",
            hmac: hmac,
          };
          socket.emit("private_message", payload);
          await db.messages.add({
            from: user,
            to: targetUser,
            decryptedText: optimizedBase64,
            ciphertext,
            type: "image",
            timestamp: Date.now(),
          });
        } catch (err) {
          console.error("Image failed:", err);
          toast.error("Failed to send image.");
        } finally {
          setIsSending(false);
          e.target.value = "";
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        toast.error("Invalid image file.");
        setIsSending(false);
        e.target.value = "";
      };
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
