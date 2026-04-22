export const ratchetKey = async (currentKeyBase64: string): Promise<string> => {
  const encoder = new TextEncoder();
  const keyBytes = encoder.encode(currentKeyBase64);

  // Hash the current key using SHA-256 to create the NEXT key
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", keyBytes);

  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return window.btoa(String.fromCharCode(...hashArray));
};
