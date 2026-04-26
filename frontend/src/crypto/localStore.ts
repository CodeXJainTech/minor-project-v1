let cachedLocalKey: CryptoKey | null = null;
let lastSourceKey: CryptoKey | null = null;

export async function getLocalKey(privateKey: CryptoKey): Promise<CryptoKey> {
  if (cachedLocalKey && lastSourceKey === privateKey) {
    return cachedLocalKey;
  }
  
  const exported = await window.crypto.subtle.exportKey("pkcs8", privateKey);
  const hash = await window.crypto.subtle.digest("SHA-256", exported);
  
  cachedLocalKey = await window.crypto.subtle.importKey(
    "raw",
    hash,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
  lastSourceKey = privateKey;
  
  return cachedLocalKey;
}

export async function encryptLocal(plaintext: string, privateKey: CryptoKey): Promise<string> {
  const key = await getLocalKey(privateKey);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );
  
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  
  // Safe conversion for large arrays (images/media)
  let binary = "";
  for (let i = 0; i < combined.length; i += 8192) {
    binary += String.fromCharCode(...combined.slice(i, i + 8192));
  }
  
  // Prefix to easily identify encrypted messages later if needed, though we use try/catch fallback
  return "LOC:" + btoa(binary);
}

export async function decryptLocal(ciphertextBase64: string, privateKey: CryptoKey): Promise<string> {
  if (!ciphertextBase64.startsWith("LOC:")) {
    // Legacy plaintext message
    return ciphertextBase64;
  }

  try {
    const key = await getLocalKey(privateKey);
    const base64 = ciphertextBase64.substring(4);
    const binary = atob(base64);
    const combined = new Uint8Array(binary.length);
    
    for (let i = 0; i < binary.length; i++) {
      combined[i] = binary.charCodeAt(i);
    }
    
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );
    
    return new TextDecoder().decode(decrypted);
  } catch (err) {
    console.warn("Failed to decrypt local message.");
    return "[Encrypted/Corrupted Message]";
  }
}
