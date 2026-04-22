import { useState, useEffect } from "react";
import { socket } from "../services/socket";
import { generateRSAKeyPair, exportPublicKey } from "../crypto/rsa";
import srp from "secure-remote-password/client";
import toast from "react-hot-toast";

export function useAuth() {
  const [user, setUser] = useState(localStorage.getItem("currentUser") || "");
  const [myPrivateKey, setMyPrivateKey] = useState<CryptoKey | null>(null);

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
              { name: "RSA-OAEP", hash: "SHA-256" },
              true,
              ["decrypt"],
            );
            setMyPrivateKey(loadedKey);
          } catch (err) {
            console.error("Failed to load key from storage:", err);
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
  ) => {
    try {
      if (isRegistering) {
        const salt = srp.generateSalt();
        const privateKey = srp.derivePrivateKey(salt, username, password);
        const verifier = srp.deriveVerifier(privateKey);

        const keys = await generateRSAKeyPair();
        const base64PublicKey = await exportPublicKey(keys.publicKey);

        const res = await fetch("http://localhost:3000/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username,
            publicKey: base64PublicKey,
            srpSalt: salt,
            srpVerifier: verifier,
          }),
        });

        if (!res.ok) throw new Error("Username taken or database error");

        setMyPrivateKey(keys.privateKey);
        const exportedPrivate = await window.crypto.subtle.exportKey(
          "pkcs8",
          keys.privateKey,
        );
        const base64PrivateKey = btoa(
          String.fromCharCode(...new Uint8Array(exportedPrivate)),
        );
        localStorage.setItem(`privateKey_${username}`, base64PrivateKey);
      } else {
        const clientEphemeral = srp.generateEphemeral();
        const challengeRes = await fetch(
          "http://localhost:3000/api/login/challenge",
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
          "http://localhost:3000/api/login/verify",
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

        const savedKeyBase64 = localStorage.getItem(`privateKey_${username}`);
        if (savedKeyBase64) {
          const binaryDerString = window.atob(savedKeyBase64);
          const binaryDer = new Uint8Array(binaryDerString.length);
          for (let i = 0; i < binaryDerString.length; i++)
            binaryDer[i] = binaryDerString.charCodeAt(i);
          const loadedKey = await window.crypto.subtle.importKey(
            "pkcs8",
            binaryDer.buffer,
            { name: "RSA-OAEP", hash: "SHA-256" },
            true,
            ["decrypt"],
          );
          setMyPrivateKey(loadedKey);
        } else {
          console.warn("RSA Private Key missing from this device.");
        }
      }

      localStorage.setItem("currentUser", username);
      setUser(username);
      socket.connect();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  useEffect(() => {
    if (user) {
      socket.connect();
    }
  }, [user]);

  useEffect(() => {
    if (user && myPrivateKey) {
      socket.emit("register_socket", user);
    }
  }, [user, myPrivateKey]);

  return { user, setUser, myPrivateKey, setMyPrivateKey, handleLogin };
}
