import { getWasmModule } from "../services/wasmLoader";

// Initialization Vector must be 16 bytes for AES
const IV = "initialvector123";

// Converts a string to a C pointer in WASM memory
function writeStringToMemory(Module: any, str: string) {
  const bytes = new TextEncoder().encode(str);
  const ptr = Module._malloc(bytes.length);
  Module.HEAPU8.set(bytes, ptr);
  return { ptr, length: bytes.length };
}

// Converts bytes to a C pointer in WASM memory
function writeBytesToMemory(Module: any, bytes: Uint8Array) {
  const ptr = Module._malloc(bytes.length);
  Module.HEAPU8.set(bytes, ptr);
  return { ptr, length: bytes.length };
}

// Encrypts a message using AES via WASM
export async function encryptAES(
  message: string,
  dynamicAesKey: string,
): Promise<string> {
  const Module = await getWasmModule();

  const textData = writeStringToMemory(Module, message);
  const keyData = writeStringToMemory(Module, dynamicAesKey);
  const ivData = writeStringToMemory(Module, IV);
  const outLenPtr = Module._malloc(4);

  const outPtr = Module._encrypt_wrapper(
    textData.ptr,
    textData.length,
    keyData.ptr,
    keyData.length,
    ivData.ptr,
    outLenPtr,
  );

  const outLen = Module.HEAP32[outLenPtr >> 2];
  const encryptedBytes = new Uint8Array(Module.HEAPU8.buffer, outPtr, outLen);

  // Convert to Base64 for safe transport (avoiding spread operator for large files)
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < encryptedBytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(encryptedBytes.subarray(i, i + chunk)),
    );
  }
  const base64Ciphertext = btoa(binary);

  // Cleanup memory
  Module._free(textData.ptr);
  Module._free(keyData.ptr);
  Module._free(ivData.ptr);
  Module._free(outLenPtr);
  Module._free_buffer(outPtr);

  return base64Ciphertext;
}

// Decrypts a Base64 message using AES via WASM
export async function decryptAES(
  base64Ciphertext: string,
  decryptedAesKey: string,
): Promise<string> {
  const Module = await getWasmModule();

  // Convert Base64 back to bytes
  const binaryStr = atob(base64Ciphertext);
  const cipherBytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++)
    cipherBytes[i] = binaryStr.charCodeAt(i);

  const cipherData = writeBytesToMemory(Module, cipherBytes);
  const keyData = writeStringToMemory(Module, decryptedAesKey);
  const ivData = writeStringToMemory(Module, IV);
  const outLenPtr = Module._malloc(4);

  const outPtr = Module._decrypt_wrapper(
    cipherData.ptr,
    cipherData.length,
    keyData.ptr,
    keyData.length,
    ivData.ptr,
    outLenPtr,
  );

  const outLen = Module.HEAP32[outLenPtr >> 2];
  const decryptedBytes = new Uint8Array(Module.HEAPU8.buffer, outPtr, outLen);

  // Decode back to string
  const plaintext = new TextDecoder().decode(decryptedBytes);

  // Cleanup memory
  Module._free(cipherData.ptr);
  Module._free(keyData.ptr);
  Module._free(ivData.ptr);
  Module._free(outLenPtr);
  Module._free_buffer(outPtr);

  return plaintext;
}
