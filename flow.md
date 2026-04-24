# Project Cipher: System Flow & Lifecycle

This document provides a detailed technical walkthrough of the application's lifecycle, from user onboarding to secure message exchange and session termination.

---

## 1. User Onboarding & Registration
**Trigger:** User fills out the registration form.

1.  **SRP Setup:** The client generates a random salt and derives a verifier from the password using the Secure Remote Password (SRP) protocol.
2.  **Permanent Key Generation:** The client generates a permanent **ECC P-256 Key Pair** for long-term identity.
3.  **Registration Request:** The client sends the `username`, `srpSalt`, `srpVerifier`, and the **Permanent Public Key** to the server.
4.  **Vault Birth:** Before the browser session continues, the client packages the **Permanent Private Key** into a JSON file and triggers an automatic browser download. 
    *   **File:** `cipher_vault_[username].json`
    *   **Zero Footprint:** The private key is NOT stored in `localStorage` or on the server.

---

## 2. Authentication (The Vault Login Checkpoint)
**Trigger:** User attempts to log in.

1.  **SRP Challenge:** The client performs the standard SRP 3-way handshake with the server to verify the password without ever sending it.
2.  **Vault Upload:** Upon password verification, the `LoginForm` requires the user to upload their `cipher_vault_[username].json`.
3.  **Active Memory Extraction:** The `useAuth` hook reads the uploaded file, imports the Private Key into a React state (`myPrivateKey`), and populates the local IndexedDB `contacts` list from the vault metadata.
4.  **Socket Registration:** Once the key is in memory, the client connects to the WebSocket and emits `register_socket`, broadcasting its "Online" status to friends.

---

## 3. The Cryptographic Handshake (ECDHE)
**Trigger:** User opens a chat with a friend for the first time in the current session.

1.  **Public Key Fetch:** The `useRatchet` hook requests the target user's **Permanent Public Key** from the server.
2.  **TOFU (Trust on First Use) Firewall:**
    *   If the key is new, it is saved to the local IndexedDB `contacts` table.
    *   If the key has changed since the last interaction, the system throws a **Critical Security Alert** and blocks the connection.
3.  **Ephemeral Key Generation:** The client generates a brand new, temporary ECC Key Pair for the session.
4.  **Shared Secret Derivation:** The client performs an ECDH exchange using its **Permanent Private Key** and the target's **Permanent Public Key** to derive the **Root AES-256-GCM Key**.
5.  **Ratchet Initialization:** This key is saved to `localStorage` under `session_[me]_[target]`, initializing the one-way hash ratchet chain.

---

## 4. Secure Message Exchange
**Trigger:** User sends a message (Text, Image, or Audio).

1.  **Encryption:** The `useChat` hook retrieves the current AES key, encrypts the payload via the **WebAssembly AES-GCM engine**, and generates the ciphertext.
2.  **The Ratchet:** After encryption, the key is immediately hashed using SHA-256 to create the **Next Key**. The previous key is overwritten in `localStorage` to provide **Forward Secrecy**.
3.  **Transmission:** 
    *   **Text:** Sent directly via WebSocket.
    *   **Media:** The encrypted blob is uploaded to `/api/upload` (5-minute self-destructing folder). The resulting short URL is sent via WebSocket.
4.  **Strict Routing:** The server checks if the target is online.
    *   **Online:** Forwarded immediately.
    *   **Offline:** Payload is instantly dropped (Zero Footprint).

---

## 5. Session Termination (Nuclear Logout)
**Trigger:** User clicks the logout button.

1.  **Vault Backup:** The system reads the `myPrivateKey` from RAM and the latest contact list from IndexedDB, creates a final backup vault file, and triggers a download.
2.  **Nuclear Wipe:** 
    *   Deletes the IndexedDB database (Messages & Contacts).
    *   Clears `localStorage` (Session keys & Auth tokens).
    *   Hard-refreshes the browser to purge all sensitive keys from active RAM.
