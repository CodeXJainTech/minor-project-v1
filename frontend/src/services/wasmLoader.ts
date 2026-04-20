// @ts-ignore - Ignores the lack of TypeScript definitions for the auto-generated Emscripten file
import createAes from '../../public/aes_engine.js';

let wasmModule: any = null;

export const getWasmModule = async () => {
    if (!wasmModule) {
        // This fetches aes_engine.wasm and initializes the C++ memory environment
        wasmModule = await createAes(); 
    }
    return wasmModule;
};