import { db } from "../services/db";

export async function encryptVaultData(data: string, password?: string): Promise<string> {
  if (!password) {
    // Just base64 encode
    return btoa(unescape(encodeURIComponent(data)));
  }

  const enc = new TextEncoder();
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  const key = await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    enc.encode(data)
  );

  const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(ciphertext), salt.length + iv.length);

  let binary = "";
  for (let i = 0; i < combined.length; i += 8192) {
    binary += String.fromCharCode(...combined.slice(i, i + 8192));
  }
  const base64 = btoa(binary);
  return "ENC:" + base64;
}

export async function decryptVaultData(data: string, password?: string): Promise<string> {
  if (!data.startsWith("ENC:")) {
    // Treat as simple base64 (unencrypted)
    try {
      return decodeURIComponent(escape(atob(data)));
    } catch (e) {
      // Legacy plaintext JSON fallback
      return data;
    }
  }

  if (!password) {
    throw new Error("Password is required to decrypt this vault file.");
  }

  const base64 = data.substring(4);
  const binary = atob(base64);
  const combined = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    combined[i] = binary.charCodeAt(i);
  }

  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 28);
  const ciphertext = combined.slice(28);

  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  const key = await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  const plaintext = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    ciphertext
  );

  const dec = new TextDecoder();
  return dec.decode(plaintext);
}

export async function exportChatBackup(password: string): Promise<string> {
  const messages = await db.messages.toArray();
  const backupData = JSON.stringify({ messages });
  return await encryptVaultData(backupData, password);
}

export async function importChatBackup(backupContent: string, password: string): Promise<void> {
  const decrypted = await decryptVaultData(backupContent, password);
  const data = JSON.parse(decrypted);
  if (data.messages && Array.isArray(data.messages)) {
    const validMessages = data.messages.filter((m: any) => m.payload);
    if (validMessages.length > 0) {
      await db.messages.bulkAdd(validMessages);
    } else {
      throw new Error("No valid messages found in backup.");
    }
  } else {
    throw new Error("Invalid backup file: No messages array found.");
  }
}
