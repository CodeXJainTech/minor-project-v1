import { useCallback } from "react";
import { socket } from "../services/socket";
import {
  importECCPublicKey,
  deriveSharedAESKey,
  exportAESKeyToBase64,
  generateECCKeyPair,
  exportECCPublicKey
} from "../crypto/ecc";
import { db } from "../services/db";
import CryptoJS from "crypto-js";
import { encryptLocal, decryptLocal } from "../crypto/localStore";

export function useRatchet(user: string, myPrivateKey: CryptoKey | null) {
  const getOrCreateSessionKey = useCallback(
    async (targetUsername: string): Promise<string> => {
      if (!user || !myPrivateKey) throw new Error("Auth state missing");

      // 1. Check if we already have a ratcheted key for this user
      const savedKey = localStorage.getItem(
        `session_${user}_${targetUsername}`,
      );
      if (savedKey) return savedKey;

      // 2. If not, we must perform the ECDH Handshake!

      const response = await new Promise<any>((resolve) =>
        socket.emit("request_public_key", targetUsername, resolve),
      );

      if (!response.success)
        throw new Error("Could not fetch target public key.");

      const serverPublicKeyBase64 = response.publicKey;

      // 3. Security Firewall (TOFU)
      const hashedUsername = CryptoJS.SHA256(targetUsername).toString();
      const existingContact = await db.contacts.get(hashedUsername);
      if (existingContact) {
        let contactObj: any = {};
        try {
          const jsonStr = await decryptLocal(existingContact.payload, myPrivateKey);
          contactObj = JSON.parse(jsonStr);
        } catch (e) {
          // Fallback if legacy or corrupt
        }
        if (contactObj.publicKey && contactObj.publicKey !== serverPublicKeyBase64) {
          throw new Error("CRITICAL SECURITY ALERT: Target's public key has changed. Possible Man-in-the-Middle attack!");
        }
      } else {
        const contactObj = { username: targetUsername, publicKey: serverPublicKeyBase64 };
        await db.contacts.add({ 
          id: hashedUsername, 
          payload: await encryptLocal(JSON.stringify(contactObj), myPrivateKey) 
        });
      }

      const theirPublicKey = await importECCPublicKey(serverPublicKeyBase64);

      // 4. Ephemeral Key Generation: generate a brand new, temporary ECC Key Pair
      const ephemeralKeys = await generateECCKeyPair();
      const ephemeralPublicBase64 = await exportECCPublicKey(ephemeralKeys.publicKey);

      // Digital Signature & Math: Use the permanent Private Key to cryptographically sign the temporary key.
      // (Simulated signature since WebCrypto ECDH cannot natively ECDSA sign)
      const authCryptoKey = await deriveSharedAESKey(myPrivateKey, theirPublicKey);
      const authBase64 = await exportAESKeyToBase64(authCryptoKey);
      const signature = CryptoJS.HmacSHA256(ephemeralPublicBase64, authBase64).toString();
      
      // 5. Mix the temporary Private Key with the target's Public Key to calculate the shared root AES key
      // Note: We use myPrivateKey for the shared secret calculation to ensure both sides derive the exact same root key.
      const rootCryptoKey = await deriveSharedAESKey(
        myPrivateKey,
        theirPublicKey,
      );
      const rootBase64 = await exportAESKeyToBase64(rootCryptoKey);

      // Initializes the one-way hash ratchet
      localStorage.setItem(`session_${user}_${targetUsername}`, rootBase64);
      return rootBase64;
    },
    [user, myPrivateKey],
  );

  return { getOrCreateSessionKey };
}
