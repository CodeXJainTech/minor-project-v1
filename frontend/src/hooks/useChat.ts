import React, { useState } from "react";
import { socket } from "../services/socket";
import { encryptAES } from "../crypto/aes_wasm";
import { importPublicKey, encryptWithPublicKey } from "../crypto/rsa";
import { generateDynamicAESKey } from "../services/utils";
import { db } from "../services/db";
import { useLiveQuery } from "dexie-react-hooks";
import toast from "react-hot-toast";

export function useChat(user: string) {
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const messages = useLiveQuery(() => db.messages.toArray()) || [];

  const sendMessage = async () => {
    console.log("Attempting to send message...", { input, activeChat, user });
    if (!input.trim() || !activeChat) {
      console.warn("Aborting send: empty input or no active chat");
      return;
    }
    const targetUser = activeChat;
    try {
      console.log(`Requesting public key for ${targetUser}...`);
      socket.emit("request_public_key", targetUser, async (response: any) => {
        if (!response.success) {
          console.error("Failed to get public key:", response.error);
          return toast.error(response.error);
        }
        console.log("Got public key, encrypting...");
        const targetPublicKey = await importPublicKey(response.publicKey);
        const dynamicAesKey = generateDynamicAESKey();
        const ciphertext = await encryptAES(input, dynamicAesKey);
        const encryptedAesKey = await encryptWithPublicKey(
          targetPublicKey,
          dynamicAesKey,
        );
        const payload = {
          to: targetUser,
          from: user,
          ciphertext,
          encryptedAesKey,
        };

        console.log("Emitting private_message...");
        socket.emit("private_message", payload);
        await db.messages.add({
          from: user,
          to: targetUser,
          decryptedText: input,
          ciphertext,
          type: "text",
          timestamp: Date.now(),
        });
        setInput("");
        console.log("Message sent and saved to DB.");
      });
    } catch (error) {
      console.error("Encryption failed:", error);
    }
  };

  const sendImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeChat) return;
    const MAX_FILE_SIZE = 1 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      toast.error("Image too large!");
      e.target.value = "";
      return;
    }
    const targetUser = activeChat;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const base64Image = event.target?.result as string;
        socket.emit("request_public_key", targetUser, async (response: any) => {
          if (!response.success)
            return toast.error("Could not get target key.");
          const targetPublicKey = await importPublicKey(response.publicKey);
          const dynamicAesKey = generateDynamicAESKey();
          const ciphertext = await encryptAES(base64Image, dynamicAesKey);
          const encryptedAesKey = await encryptWithPublicKey(
            targetPublicKey,
            dynamicAesKey,
          );
          const blob = new Blob([ciphertext], { type: "text/plain" });
          const formData = new FormData();
          formData.append("encryptedFile", blob);
          const uploadRes = await fetch("http://localhost:3000/api/upload", {
            method: "POST",
            body: formData,
          });
          if (!uploadRes.ok) throw new Error("Upload failed.");
          const { url } = await uploadRes.json();
          const payload = {
            to: targetUser,
            from: user,
            ciphertext: url,
            encryptedAesKey,
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
        });
      } catch (err) {
        console.error("Image failed:", err);
      }
    };
    reader.readAsDataURL(file);
  };

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
  };
}
