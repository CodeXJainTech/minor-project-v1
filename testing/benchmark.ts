import { getWasmModule } from "../frontend/src/services/wasmLoader";

const IV = "initialvector123"; // 16 bytes

function makeMessage(sizeInBytes: number): string {
    return "A".repeat(sizeInBytes);
}

function now(): number {
    return performance.now();
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    const chunkSize = 8192;

    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(
            null,
            Array.from(bytes.subarray(i, i + chunkSize)),
        );
    }

    return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
}

async function importJsAESKey(base64Key: string): Promise<CryptoKey> {
    const rawKey = base64ToBytes(base64Key);

    return await crypto.subtle.importKey(
        "raw",
        rawKey,
        { name: "AES-GCM" },
        false,
        ["encrypt", "decrypt"],
    );
}

/* =========================
   JavaScript AES-GCM
========================= */

async function encryptAES_JS(
    message: string,
    base64Key: string,
): Promise<string> {
    const key = await importJsAESKey(base64Key);
    const encoded = new TextEncoder().encode(message);
    const iv = new TextEncoder().encode(IV);

    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        encoded,
    );

    return bytesToBase64(new Uint8Array(encrypted));
}

async function decryptAES_JS(
    base64Ciphertext: string,
    base64Key: string,
): Promise<string> {
    const key = await importJsAESKey(base64Key);
    const cipherBytes = base64ToBytes(base64Ciphertext);
    const iv = new TextEncoder().encode(IV);

    const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        cipherBytes,
    );

    return new TextDecoder().decode(decrypted);
}

/* =========================
   WASM AES
========================= */

function writeStringToMemory(Module: any, str: string) {
    const bytes = new TextEncoder().encode(str);
    const ptr = Module._malloc(bytes.length);
    Module.HEAPU8.set(bytes, ptr);
    return { ptr, length: bytes.length };
}

function writeBytesToMemory(Module: any, bytes: Uint8Array) {
    const ptr = Module._malloc(bytes.length);
    Module.HEAPU8.set(bytes, ptr);
    return { ptr, length: bytes.length };
}

async function encryptAES_WASM(
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
    const base64Ciphertext = bytesToBase64(encryptedBytes);

    Module._free(textData.ptr);
    Module._free(keyData.ptr);
    Module._free(ivData.ptr);
    Module._free(outLenPtr);
    Module._free_buffer(outPtr);

    return base64Ciphertext;
}

async function decryptAES_WASM(
    base64Ciphertext: string,
    decryptedAesKey: string,
): Promise<string> {
    const Module = await getWasmModule();

    const cipherBytes = base64ToBytes(base64Ciphertext);

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

    if (!outPtr) {
        throw new Error("WASM decryption failed");
    }

    const outLen = Module.HEAP32[outLenPtr >> 2];
    const decryptedBytes = new Uint8Array(Module.HEAPU8.buffer, outPtr, outLen);
    const plaintext = new TextDecoder().decode(decryptedBytes);

    Module._free(cipherData.ptr);
    Module._free(keyData.ptr);
    Module._free(ivData.ptr);
    Module._free(outLenPtr);
    Module._free_buffer(outPtr);

    return plaintext;
}

/* =========================
   Benchmark Runner
========================= */

export async function benchmarkAES(): Promise<void> {
    const messageSize = 1024 * 100; // 100 KB
    const testMessage = makeMessage(messageSize);

    const rawKey = crypto.getRandomValues(new Uint8Array(32)); // AES-256
    const base64Key = bytesToBase64(rawKey);

    console.log("========== AES Benchmark ==========");
    console.log("Message size:", messageSize, "bytes");
    console.log("Key size:", rawKey.length * 8, "bits");

    // Warm up
    await encryptAES_JS(testMessage, base64Key);
    await encryptAES_WASM(testMessage, base64Key);

    console.log("\n--- JavaScript AES-GCM ---");

    const jsEncryptStart = now();
    const jsCipher = await encryptAES_JS(testMessage, base64Key);
    const jsEncryptEnd = now();

    const jsDecryptStart = now();
    const jsPlain = await decryptAES_JS(jsCipher, base64Key);
    const jsDecryptEnd = now();

    console.log("JS encryption delay:", (jsEncryptEnd - jsEncryptStart).toFixed(3), "ms");
    console.log("JS decryption delay:", (jsDecryptEnd - jsDecryptStart).toFixed(3), "ms");
    console.log("JS decrypted correctly:", jsPlain === testMessage);

    console.log("\n--- WASM AES ---");

    const wasmEncryptStart = now();
    const wasmCipher = await encryptAES_WASM(testMessage, base64Key);
    const wasmEncryptEnd = now();

    const wasmDecryptStart = now();
    const wasmPlain = await decryptAES_WASM(wasmCipher, base64Key);
    const wasmDecryptEnd = now();

    console.log("WASM encryption delay:", (wasmEncryptEnd - wasmEncryptStart).toFixed(3), "ms");
    console.log("WASM decryption delay:", (wasmDecryptEnd - wasmDecryptStart).toFixed(3), "ms");
    console.log("WASM decrypted correctly:", wasmPlain === testMessage);

    console.log("\n--- Summary ---");

    const jsTotal = jsEncryptEnd - jsEncryptStart + jsDecryptEnd - jsDecryptStart;
    const wasmTotal =
        wasmEncryptEnd - wasmEncryptStart + wasmDecryptEnd - wasmDecryptStart;

    console.log("JS total delay:", jsTotal.toFixed(3), "ms");
    console.log("WASM total delay:", wasmTotal.toFixed(3), "ms");
    console.log("WASM speedup:", (jsTotal / wasmTotal).toFixed(2), "x");
}

benchmarkAES();