import { getWasmModule } from '../services/wasmLoader';

// Must be exactly 16, 24, or 32 bytes for AES
const SECRET_KEY = "cyber_security_project_key_123!!"; 
// Initialization Vector must be exactly 16 bytes
const IV = "initialvector123"; 

// Helper: Convert JS String to C Pointer
function writeStringToMemory(Module: any, str: string) {
    const bytes = new TextEncoder().encode(str);
    const ptr = Module._malloc(bytes.length);
    Module.HEAPU8.set(bytes, ptr);
    return { ptr, length: bytes.length };
}

// Helper: Convert raw bytes to C Pointer
function writeBytesToMemory(Module: any, bytes: Uint8Array) {
    const ptr = Module._malloc(bytes.length);
    Module.HEAPU8.set(bytes, ptr);
    return { ptr, length: bytes.length };
}

export async function encryptAES(message: string): Promise<string> {
    const Module = await getWasmModule();

    const textData = writeStringToMemory(Module, message);
    const keyData = writeStringToMemory(Module, SECRET_KEY);
    const ivData = writeStringToMemory(Module, IV);
    const outLenPtr = Module._malloc(4);

    // Call C++ aes_bridge.c
    const outPtr = Module._encrypt_wrapper(
        textData.ptr, textData.length,
        keyData.ptr, keyData.length,
        ivData.ptr, outLenPtr
    );

    const outLen = Module.HEAP32[outLenPtr >> 2];
    const encryptedBytes = new Uint8Array(Module.HEAPU8.buffer, outPtr, outLen);
    
    // Convert to Base64 to send over WebSockets safely
    const base64Ciphertext = btoa(String.fromCharCode(...encryptedBytes));

    // FREE MEMORY!
    Module._free(textData.ptr); Module._free(keyData.ptr);
    Module._free(ivData.ptr); Module._free(outLenPtr);
    Module._free_buffer(outPtr);

    return base64Ciphertext;
}

export async function decryptAES(base64Ciphertext: string): Promise<string> {
    const Module = await getWasmModule();

    // Convert Base64 back to raw bytes
    const binaryStr = atob(base64Ciphertext);
    const cipherBytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) cipherBytes[i] = binaryStr.charCodeAt(i);

    const cipherData = writeBytesToMemory(Module, cipherBytes);
    const keyData = writeStringToMemory(Module, SECRET_KEY);
    const ivData = writeStringToMemory(Module, IV);
    const outLenPtr = Module._malloc(4);

    // Call C++ aes_bridge.c
    const outPtr = Module._decrypt_wrapper(
        cipherData.ptr, cipherData.length,
        keyData.ptr, keyData.length,
        ivData.ptr, outLenPtr
    );

    const outLen = Module.HEAP32[outLenPtr >> 2];
    const decryptedBytes = new Uint8Array(Module.HEAPU8.buffer, outPtr, outLen);
    
    // Convert back to human readable string
    const plaintext = new TextDecoder().decode(decryptedBytes);

    // FREE MEMORY!
    Module._free(cipherData.ptr); Module._free(keyData.ptr);
    Module._free(ivData.ptr); Module._free(outLenPtr);
    Module._free_buffer(outPtr);

    return plaintext;
}