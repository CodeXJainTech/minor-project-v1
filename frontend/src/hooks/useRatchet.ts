import { useCallback } from "react";
import { socket } from "../services/socket";
import {
  importECCPublicKey,
  deriveSharedAESKey,
  exportAESKeyToBase64,
  generateECCKeyPair,
  exportECCPublicKey,
} from "../crypto/ecc";
import { db } from "../services/db";
import CryptoJS from "crypto-js";
import { encryptLocal, decryptLocal } from "../crypto/localStore";

export interface RatchetResult {
  key: string;
  eph?: string;
  sig?: string;
  isHandshakeCollision?: boolean;
}

export function useRatchet(user: string, myPrivateKey: CryptoKey | null) {
  const getOrCreateSessionKey = useCallback(
    async (
      targetUsername: string,
      remoteEph?: string,
      remoteSig?: string,
    ): Promise<RatchetResult> => {
      if (!user || !myPrivateKey) throw new Error("Auth state missing");

      // 1. Check if we already have a ratcheted key for this user
      const savedKey = localStorage.getItem(
        `session_${user}_${targetUsername}`,
      );

      // If we are NOT receiving a handshake (no remoteEph), just return the saved key
      if (savedKey && !remoteEph) return { key: savedKey };

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
          const jsonStr = await decryptLocal(
            existingContact.payload,
            myPrivateKey,
          );
          contactObj = JSON.parse(jsonStr);
        } catch (e) {
          // Fallback if legacy or corrupt
        }
        if (
          contactObj.publicKey &&
          contactObj.publicKey !== serverPublicKeyBase64
        ) {
          throw new Error(
            "CRITICAL SECURITY ALERT: Target's public key has changed. Possible Man-in-the-Middle attack!",
          );
        }
      } else {
        const contactObj = {
          username: targetUsername,
          publicKey: serverPublicKeyBase64,
        };
        await db.contacts.add({
          id: hashedUsername,
          payload: await encryptLocal(JSON.stringify(contactObj), myPrivateKey),
        });
      }

      const theirPublicKey = await importECCPublicKey(serverPublicKeyBase64);

      // 4. Authenticated Key Exchange (AKE)
      // First, derive the static-static shared secret for authentication
      const authCryptoKey = await deriveSharedAESKey(
        myPrivateKey,
        theirPublicKey,
      );
      const authBase64 = await exportAESKeyToBase64(authCryptoKey);

      if (remoteEph && remoteSig) {
        //RECEIVER
        // Verify that the ephemeral key was signed by the owner of the static private key
        const expectedSig = CryptoJS.HmacSHA256(
          remoteEph,
          authBase64,
        ).toString();
        if (expectedSig !== remoteSig) {
          throw new Error(
            "Handshake Security Failure: Ephemeral key signature mismatch!",
          );
        }

        // Derive the root session key using our static private key and their ephemeral public key
        const remoteEphPublicKey = await importECCPublicKey(remoteEph);
        const rootCryptoKey = await deriveSharedAESKey(
          myPrivateKey,
          remoteEphPublicKey,
        );
        const rootBase64 = await exportAESKeyToBase64(rootCryptoKey);

        // COLLISION HANDLING: If we already have a session, use a tie-breaker
        if (savedKey) {
          if (targetUsername < user) {
            // THEY WIN: Adopt their session as our new base
            localStorage.setItem(
              `session_${user}_${targetUsername}`,
              rootBase64,
            );
            return { key: rootBase64 };
          } else {
            // WE WIN: Use their key for THIS message only, but keep our own session state
            return { key: rootBase64, isHandshakeCollision: true };
          }
        }

        localStorage.setItem(`session_${user}_${targetUsername}`, rootBase64);
        return { key: rootBase64 };
      } else {
        //INITIATOR
        // Generate a fresh ephemeral key pair for this session
        const ephemeralKeys = await generateECCKeyPair();
        const ephPublicBase64 = await exportECCPublicKey(
          ephemeralKeys.publicKey,
        );

        // Sign the ephemeral public key using the static shared secret
        const signature = CryptoJS.HmacSHA256(
          ephPublicBase64,
          authBase64,
        ).toString();

        // Derive the root session key using our ephemeral private key and their static public key
        const rootCryptoKey = await deriveSharedAESKey(
          ephemeralKeys.privateKey,
          theirPublicKey,
        );
        const rootBase64 = await exportAESKeyToBase64(rootCryptoKey);

        localStorage.setItem(`session_${user}_${targetUsername}`, rootBase64);
        return {
          key: rootBase64,
          eph: ephPublicBase64,
          sig: signature,
        };
      }
    },
    [user, myPrivateKey],
  );

  return { getOrCreateSessionKey };
}
