#include <stdlib.h>
#include "aes.h"

// Exported function for React to call
unsigned char* encrypt_wrapper(unsigned char* text, int text_len, unsigned char* key, int key_len, unsigned char* iv, int* out_len) {
    unsigned char* out = NULL;
    // AES_CBC mode is 1 (defined in your aes.h)
    *out_len = aes_encrypt(text, text_len, key, key_len, 1, iv, &out);
    return out; // Returns pointer to WASM memory
}

unsigned char* decrypt_wrapper(unsigned char* cipher, int cipher_len, unsigned char* key, int key_len, unsigned char* iv, int* out_len) {
    unsigned char* out = NULL;
    *out_len = aes_decrypt(cipher, cipher_len, key, key_len, 1, iv, &out);
    return out;
}


void free_buffer(unsigned char* ptr) {
    free(ptr);
}