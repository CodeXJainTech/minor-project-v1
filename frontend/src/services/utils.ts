// Generates a cryptographically secure 32-character string
export const generateDynamicAESKey = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  const randomValues = new Uint32Array(32);
  window.crypto.getRandomValues(randomValues);
  
  let key = '';
  for (let i = 0; i < 32; i++) {
    key += chars[randomValues[i] % chars.length];
  }
  return key;
};