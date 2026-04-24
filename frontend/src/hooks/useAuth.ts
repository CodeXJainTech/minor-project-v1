import { useState, useEffect } from "react";
import { socket } from "../services/socket";
import { generateECCKeyPair, exportECCPublicKey } from "../crypto/ecc";
import srp from "secure-remote-password/client";
import toast from "react-hot-toast";
import { db } from "../services/db";

export function useAuth() {
  const [user, setUser] = useState(localStorage.getItem("currentUser") || "");
  const [myPrivateKey, setMyPrivateKey] = useState<CryptoKey | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadKey = async () => {
      if (user) {
        const savedKeyBase64 = localStorage.getItem(`privateKey_${user}`);
        if (savedKeyBase64) {
          try {
            const binaryDerString = window.atob(savedKeyBase64);
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
          } catch (err) {
            toast.error("Failed to load key from storage");
          }
        }
      }
    };
    loadKey();
  }, [user]);

  const handleLogin = async (
    username: string,
    password: string,
    isRegistering: boolean,
    vaultFile?: File | null
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
        
        // Vault Birth: Download the private key
        const vaultData = JSON.stringify({ privateKey: base64PrivateKey, contacts: [] });
        const blob = new Blob([vaultData], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `cipher_vault_${username}.json`;
        a.click();
        URL.revokeObjectURL(url);

      } else {
        if (!vaultFile) {
          throw new Error("Vault file is required for login!");
        }
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

        // Vault Login Checkpoint: Extract Private Key and Contacts
        const fileContent = await vaultFile.text();
        const vault = JSON.parse(fileContent);

        if (!vault.privateKey) {
          throw new Error("Invalid vault file: Missing private key.");
        }

        const binaryDerString = window.atob(vault.privateKey);
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

        if (vault.contacts && Array.isArray(vault.contacts)) {
          await db.contacts.clear();
          await db.contacts.bulkAdd(vault.contacts);
        }
      }

      localStorage.setItem("currentUser", username);
      setUser(username);
      socket.connect();
    } catch (err: any) {
      toast.error(err.message);
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

  const handleLogout = async () => {
    if (!myPrivateKey || !user) return;
    
    // 1. Export private key
    const exportedPrivate = await window.crypto.subtle.exportKey("pkcs8", myPrivateKey);
    const base64PrivateKey = btoa(String.fromCharCode(...new Uint8Array(exportedPrivate)));
    
    // 2. Export contacts
    const contacts = await db.contacts.toArray();
    
    // 3. Create Vault backup
    const vaultData = JSON.stringify({ privateKey: base64PrivateKey, contacts });
    const blob = new Blob([vaultData], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cipher_vault_backup_${user}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // 4. Nuclear wipe
    await db.delete();
    localStorage.clear();
    window.location.reload();
  };

  return {
    user,
    setUser,
    myPrivateKey,
    setMyPrivateKey,
    handleLogin,
    handleLogout,
    isLoading,
  };
}
