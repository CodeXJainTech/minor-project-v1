import CryptoJS from "crypto-js";

const TEMP_SEC_KEY = "this_is_a_sample_encryption_key";

export function encryptAes(message: string): string{
  const encrpted = CryptoJS.AES.encrypt(message, TEMP_SEC_KEY);
  const ct_string: string = encrpted.toString();
  return ct_string;
}

export function decryptAes(ciphertext: string): string{
  const decrpted = CryptoJS.AES.decrypt(ciphertext, TEMP_SEC_KEY);
  const pt_string: string = decrpted.toString(CryptoJS.enc.Utf8);
  return pt_string;
}