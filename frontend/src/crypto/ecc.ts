// src/crypto/ecc.ts

// We use the NIST P-256 curve, which is the industry standard for fast, secure ECC.
const CURVE = "P-256";

// 1. Generate an ECDH Key Pair (For the actual Key Agreement)
export const generateECCKeyPair = async (): Promise<CryptoKeyPair> => {
  return await window.crypto.subtle.generateKey(
    {
      name: "ECDH",
      namedCurve: CURVE,
    },
    true, // Extractable so we can save the Private Key to localStorage
    ["deriveKey", "deriveBits"],
  );
};

// 2. Export Public Key to Base64 (To send to your Express Server/PostgreSQL)
export const exportECCPublicKey = async (
  publicKey: CryptoKey,
): Promise<string> => {
  const exported = await window.crypto.subtle.exportKey("raw", publicKey);
  const exportedArray = Array.from(new Uint8Array(exported));
  return window.btoa(String.fromCharCode(...exportedArray));
};

// 3. Import Public Key from Base64 (When grabbing Bob's key from the server)
export const importECCPublicKey = async (
  base64Key: string,
): Promise<CryptoKey> => {
  const binaryDerString = window.atob(base64Key);
  const binaryDer = new Uint8Array(binaryDerString.length);
  for (let i = 0; i < binaryDerString.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i);
  }

  return await window.crypto.subtle.importKey(
    "raw",
    binaryDer.buffer,
    { name: "ECDH", namedCurve: CURVE },
    true,
    [],
  );
};

// 4. THE MAGIC: Derive the Shared AES Key!
// Alice inputs: Alice's Private Key + Bob's Public Key
// Bob inputs: Bob's Private Key + Alice's Public Key
// Output: The exact same AES-256-GCM key magically generated on both computers!
export const deriveSharedAESKey = async (
  myPrivateKey: CryptoKey,
  theirPublicKey: CryptoKey,
): Promise<CryptoKey> => {
  return await window.crypto.subtle.deriveKey(
    {
      name: "ECDH",
      public: theirPublicKey,
    },
    myPrivateKey,
    {
      name: "AES-GCM",
      length: 256,
    },
    true, // Set to true so we can extract the raw bytes for your WebAssembly engine
    ["encrypt", "decrypt"],
  );
};

// 5. Convert CryptoKey to Raw Base64 String (So your C++ WASM engine can read it)
export const exportAESKeyToBase64 = async (
  aesKey: CryptoKey,
): Promise<string> => {
  const raw = await window.crypto.subtle.exportKey("raw", aesKey);
  const rawArray = Array.from(new Uint8Array(raw));
  return window.btoa(String.fromCharCode(...rawArray));
};
