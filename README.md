# Cyber Chat - End-to-End Encrypted Messaging

## Progress Report

### What Has Been Done (Completed)
1. **Real-time Infrastructure:** * Built an Express backend with Socket.io to route messages between connected clients.
   * Created a React frontend with a basic UI for logging in and sending messages.
   * Implemented in-memory state management for active users and chat history.
2. **Encryption Proof of Concept:** * Wrote a custom Caesar cipher to test the concept of encrypting payloads on the frontend before sending them over WebSockets.
3. **Standard Symmetric Encryption:** * Replaced the Caesar cipher with standard **AES-128-CBC** using the `crypto-js` library.
   * Both clients currently use a pre-shared secret key to encrypt and decrypt messages locally. The server successfully routes the Base64 ciphertext without reading the contents.

### What Has To Be Done (Next Steps)
1. **WebAssembly (WASM) Integration (Currently In Progress):** * Writing the AES algorithm from scratch in C++.
   * Compiling the C++ code to WebAssembly using Emscripten to run the encryption engine natively in the browser for better performance and memory management.
2. **Secure Key Exchange:** * Replacing the hardcoded pre-shared key with asymmetric cryptography (RSA) so users can securely exchange session keys over the network.
3. **Database Integration:** * Replacing the backend in-memory arrays with a persistent database (like PostgreSQL via Prisma) to store user accounts and encrypted offline messages.

## How to Run Locally

**1. Start the Backend:**
```bash
cd backend
npm install
npm run dev
```

**2. Start the frontend.**
```bash
cd frontend
npm install
npm run dev