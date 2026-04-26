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

// ---------------------------------------------------------
// Core Implementations
// ---------------------------------------------------------

async function encryptAES_JS_raw(message: string, base64Key: string): Promise<Uint8Array> {
    const key = await importJsAESKey(base64Key);
    const encoded = new TextEncoder().encode(message);
    const iv = new TextEncoder().encode(IV);
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
    return new Uint8Array(encrypted);
}

function writeStringToMemory(Module: any, str: string) {
    const bytes = new TextEncoder().encode(str);
    const ptr = Module._malloc(bytes.length);
    Module.HEAPU8.set(bytes, ptr);
    return { ptr, length: bytes.length };
}

async function encryptAES_WASM_raw(message: string, dynamicAesKey: string): Promise<Uint8Array> {
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
    // .slice() to copy out of WASM memory before we free it
    const encryptedBytes = new Uint8Array(Module.HEAPU8.buffer, outPtr, outLen).slice();

    Module._free(textData.ptr);
    Module._free(keyData.ptr);
    Module._free(ivData.ptr);
    Module._free(outLenPtr);
    Module._free_buffer(outPtr);

    return encryptedBytes;
}

// ---------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------

function logMemory(label: string) {
    const mem = process.memoryUsage();
    console.log(`[Memory] ${label}: ${Math.round(mem.heapUsed / 1024 / 1024)} MB`);
}

async function runBenchmarks() {
    const rawKey = crypto.getRandomValues(new Uint8Array(32));
    const base64Key = bytesToBase64(rawKey);
    
    // WARMUP
    await encryptAES_JS_raw("warmup", base64Key);
    await encryptAES_WASM_raw("warmup", base64Key);

    console.log("==================================================");
    console.log("      ADVANCED PERFORMANCE BENCHMARKS             ");
    console.log("==================================================\n");

    // 1. Base64 Overhead
    console.log("--- 1. Base64 Encoding Overhead ---");
    const testBytes = new Uint8Array(1024 * 1024).fill(1); // 1MB
    const b64Start = now();
    const b64Str = bytesToBase64(testBytes);
    const b64End = now();
    
    const b64DecodeStart = now();
    base64ToBytes(b64Str);
    const b64DecodeEnd = now();
    
    console.log(`Time to Base64 encode 1MB: ${(b64End - b64Start).toFixed(2)} ms`);
    console.log(`Time to Base64 decode 1MB: ${(b64DecodeEnd - b64DecodeStart).toFixed(2)} ms\n`);


    // 2. Key Setup Overhead
    console.log("--- 2. Key Setup & Initialization ---");
    const ksStart = now();
    for (let i = 0; i < 1000; i++) {
        await importJsAESKey(base64Key);
    }
    const ksEnd = now();
    console.log(`JS \`crypto.subtle.importKey\` (1000 times): ${(ksEnd - ksStart).toFixed(2)} ms`);
    
    // WASM doesn't have a strict "importKey" as it's passed dynamically, 
    // but we can measure how long `getWasmModule()` takes when already cached.
    const wksStart = now();
    for (let i = 0; i < 1000; i++) {
        await getWasmModule();
    }
    const wksEnd = now();
    console.log(`WASM Module getter (1000 times): ${(wksEnd - wksStart).toFixed(2)} ms\n`);


    // 3. Small Message Latency
    console.log("--- 3. Small Message Latency (10,000x 50-byte msgs) ---");
    const smallMsg = makeMessage(50);
    const iters = 10000;

    const smallJsStart = now();
    for (let i = 0; i < iters; i++) {
        await encryptAES_JS_raw(smallMsg, base64Key);
    }
    const smallJsEnd = now();

    const smallWasmStart = now();
    for (let i = 0; i < iters; i++) {
        await encryptAES_WASM_raw(smallMsg, base64Key);
    }
    const smallWasmEnd = now();

    console.log(`JS Total Time: ${(smallJsEnd - smallJsStart).toFixed(2)} ms`);
    console.log(`WASM Total Time: ${(smallWasmEnd - smallWasmStart).toFixed(2)} ms`);
    console.log(`WASM is ${((smallWasmEnd - smallWasmStart) / (smallJsEnd - smallJsStart)).toFixed(2)}x slower for small messages.\n`);


    // 4. Throughput Testing
    console.log("--- 4. Throughput Testing (5MB Payload) ---");
    const largeMsg = makeMessage(5 * 1024 * 1024); // 5MB
    
    logMemory("Before 5MB JS Encryption");
    const tpJsStart = now();
    await encryptAES_JS_raw(largeMsg, base64Key);
    const tpJsEnd = now();
    logMemory("After 5MB JS Encryption");

    logMemory("Before 5MB WASM Encryption");
    const tpWasmStart = now();
    await encryptAES_WASM_raw(largeMsg, base64Key);
    const tpWasmEnd = now();
    logMemory("After 10MB WASM Encryption");

    const jsTimeSec = (tpJsEnd - tpJsStart) / 1000;
    const wasmTimeSec = (tpWasmEnd - tpWasmStart) / 1000;

    console.log(`JS Throughput: ${(5 / jsTimeSec).toFixed(2)} MB/s`);
    console.log(`WASM Throughput: ${(5 / wasmTimeSec).toFixed(2)} MB/s\n`);
}

runBenchmarks().catch(console.error);
