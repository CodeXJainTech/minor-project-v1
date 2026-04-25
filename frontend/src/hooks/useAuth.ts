import { useState, useEffect } from "react";
import { socket } from "../services/socket";
import { generateECCKeyPair, exportECCPublicKey } from "../crypto/ecc";
import srp from "secure-remote-password/client";
import toast from "react-hot-toast";
import { db } from "../services/db";
import { encryptVaultData, decryptVaultData, exportChatBackup, importChatBackup } from "../crypto/vault";

export function useAuth() {
  const [user, setUser] = useState(localStorage.getItem("currentUser") || "");
  const [myPrivateKey, setMyPrivateKey] = useState<CryptoKey | null>(null);
  const [isLoading, setIsLoading] = useState(false);



  const handleLogin = async (
    username: string,
    password: string,
    isRegistering: boolean,
    vaultFile?: File | null,
    vaultPassword?: string
  ) => {
    setIsLoading(true);
    try {
      if (isRegistering) {
        const salt = srp.generateSalt();
        const privateKey = srp.derivePrivateKey(salt, username, password);
        const verifier = srp.deriveVerifier(privateKey);


        const keys = await generateECCKeyPair();
        const base64PublicKey = await exportECCPublicKey(keys.publicKey);

        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/register`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              username,
              publicKey: base64PublicKey,
              srpSalt: salt,
              srpVerifier: verifier,
            }),
          },
        );

        if (!res.ok) throw new Error("Username taken or database error");

        setMyPrivateKey(keys.privateKey);
        const exportedPrivate = await window.crypto.subtle.exportKey(
          "pkcs8",
          keys.privateKey,
        );
        const base64PrivateKey = btoa(
          String.fromCharCode(...new Uint8Array(exportedPrivate)),
        );
        // Securely cache the private key for returning logins
        const encryptedCache = await encryptVaultData(base64PrivateKey, password);
        localStorage.setItem(`encryptedPrivateKey_${username}`, encryptedCache);
        
        // Vault Birth: Do not download automatically anymore.
        // User must click Download Vault in the UI.

      } else {
        const clientEphemeral = srp.generateEphemeral();
        const challengeRes = await fetch(
          `${import.meta.env.VITE_API_URL}/api/login/challenge`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              username,
              clientEphemeralPublic: clientEphemeral.public,
            }),
          },
        );

        if (!challengeRes.ok) throw new Error("User not found.");
        const { salt, serverEphemeralPublic } = await challengeRes.json();

        const privateKey = srp.derivePrivateKey(salt, username, password);
        const clientSession = srp.deriveSession(
          clientEphemeral.secret,
          serverEphemeralPublic,
          salt,
          username,
          privateKey,
        );

        const verifyRes = await fetch(
          `${import.meta.env.VITE_API_URL}/api/login/verify`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              username,
              clientEphemeralPublic: clientEphemeral.public,
              clientSessionProof: clientSession.proof,
            }),
          },
        );

        if (!verifyRes.ok) throw new Error("Invalid password!");

        // If vaultFile is missing, try to load from secure cache
        let base64PrivateKeyToImport = "";
        
        if (!vaultFile) {
          const cachedKey = localStorage.getItem(`encryptedPrivateKey_${username}`);
          if (!cachedKey) {
            throw new Error("Vault file is required when logging into a new device.");
          }
          try {
            base64PrivateKeyToImport = await decryptVaultData(cachedKey, password);
          } catch (err) {
            throw new Error("Failed to decrypt cached key. If you changed your password or cache is corrupted, you must upload your vault file.");
          }
        } else {
          // Vault Login Checkpoint: Extract Private Key and Contacts
          const fileContent = await vaultFile.text();
          const decryptedContent = await decryptVaultData(fileContent, vaultPassword);
          const vault = JSON.parse(decryptedContent);

          if (!vault.privateKey) {
            throw new Error("Invalid vault file: Missing private key.");
          }
          base64PrivateKeyToImport = vault.privateKey;

          // Securely cache the newly imported private key
          const encryptedCache = await encryptVaultData(base64PrivateKeyToImport, password);
          localStorage.setItem(`encryptedPrivateKey_${username}`, encryptedCache);

          if (vault.contacts && Array.isArray(vault.contacts)) {
            await db.contacts.clear();
            const validContacts = vault.contacts.filter((c: any) => c.id && c.payload);
            if (validContacts.length > 0) {
              await db.contacts.bulkAdd(validContacts);
            }
          }
        }

        const binaryDerString = window.atob(base64PrivateKeyToImport);
        const binaryDer = new Uint8Array(binaryDerString.length);
        for (let i = 0; i < binaryDerString.length; i++)
          binaryDer[i] = binaryDerString.charCodeAt(i);
        const loadedKey = await window.crypto.subtle.importKey(
          "pkcs8",
          binaryDer.buffer,
          { name: "ECDH", namedCurve: "P-256" },
          true,
          ["deriveKey", "deriveBits"],
        );
        setMyPrivateKey(loadedKey);
      }

      localStorage.setItem("currentUser", username);
      setUser(username);
      socket.connect();
    } catch (err: any) {
      console.error("Login Error:", err);
      toast.error(err?.message || "An unknown error occurred during login.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!user || !myPrivateKey) return;

    const onConnect = () => {
      socket.emit("register_socket", user);
    };

    if (socket.connected) {
      onConnect();
    }

    socket.on("connect", onConnect);
    socket.connect();

    return () => {
      socket.off("connect", onConnect);
    };
  }, [user, myPrivateKey]);

  const handleDownloadVault = async (vaultPassword?: string) => {
    if (!myPrivateKey || !user) return;
    try {
      const exportedPrivate = await window.crypto.subtle.exportKey("pkcs8", myPrivateKey);
      const base64PrivateKey = btoa(String.fromCharCode(...new Uint8Array(exportedPrivate)));
      const contacts = await db.contacts.toArray();
      const vaultData = JSON.stringify({ privateKey: base64PrivateKey, contacts });
      
      const encryptedData = await encryptVaultData(vaultData, vaultPassword);
      
      const blob = new Blob([encryptedData], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cipher_vault_${user}.vault`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Vault downloaded securely.");
    } catch (err: any) {
      toast.error("Failed to download vault: " + err.message);
    }
  };

  const handleExportChats = async (password: string) => {
    try {
      if (!user) return;
      const backupString = await exportChatBackup(password);
      const blob = new Blob([backupString], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cipher_chats_${user}.cipherbackup`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Chat history backed up securely.");
    } catch (err: any) {
      toast.error("Failed to backup chats: " + err.message);
    }
  };

  const handleImportChats = async (file: File, password: string) => {
    try {
      const content = await file.text();
      await importChatBackup(content, password);
      toast.success("Chat history restored successfully.");
    } catch (err: any) {
      toast.error("Failed to restore chats: " + err.message);
    }
  };

  const handleWipeCache = async () => {
    try {
      await db.messages.clear();
      await db.contacts.clear();
      // Optional: wipe ratchet state
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`session_${user}_`)) {
          keysToRemove.push(key);
        }
      }
      for (const key of keysToRemove) {
         localStorage.removeItem(key);
      }
      
      toast.success("Local cache completely wiped.");
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      toast.error("Failed to wipe cache: " + err.message);
    }
  };

  const handleLogout = async (shouldDownload: boolean = false, vaultPassword?: string, clearCache: boolean = false) => {
    if (!myPrivateKey || !user) return;
    
    if (shouldDownload) {
      await handleDownloadVault(vaultPassword);
      await new Promise(resolve => setTimeout(resolve, 1500)); // Ensure download begins before reload
    }

    if (clearCache) {
      await db.messages.clear();
      await db.contacts.clear();
    }
    
    // Secure sign out
    localStorage.removeItem("currentUser");
    setMyPrivateKey(null);
    setUser("");
    window.location.reload();
  };

  return {
    user,
    setUser,
    myPrivateKey,
    setMyPrivateKey,
    handleLogin,
    handleLogout,
    handleDownloadVault,
    handleExportChats,
    handleImportChats,
    handleWipeCache,
    isLoading,
  };
}
