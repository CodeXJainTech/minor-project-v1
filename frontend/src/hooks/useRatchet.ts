import { useCallback } from "react";
import { socket } from "../services/socket";
import {
  importECCPublicKey,
  deriveSharedAESKey,
  exportAESKeyToBase64,
} from "../crypto/ecc";

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
      console.log(
        `No active session with ${targetUsername}. Performing ECDH Handshake...`,
      );
      const response = await new Promise<any>((resolve) =>
        socket.emit("request_public_key", targetUsername, resolve),
      );

      if (!response.success)
        throw new Error("Could not fetch target public key.");

      const theirPublicKey = await importECCPublicKey(response.publicKey);

      // THE MAGIC: Mix our private key with their public key to derive the Root AES Key
      const rootCryptoKey = await deriveSharedAESKey(
        myPrivateKey,
        theirPublicKey,
      );
      const rootBase64 = await exportAESKeyToBase64(rootCryptoKey);

      // Save it to start the Ratchet chain
      localStorage.setItem(`session_${user}_${targetUsername}`, rootBase64);
      return rootBase64;
    },
    [user, myPrivateKey],
  );

  return { getOrCreateSessionKey };
}
