import { Dexie, type Table } from 'dexie';

export interface SavedMessage {
  id?: number; // Auto-incremented by Dexie
  from: string;
  to: string;
  ciphertext: string;
  decryptedText: string;
  type: 'text' | 'image' | 'audio';
  timestamp: number;
}
export interface Contact {
  username: string;
  publicKey: string;
}

class CipherDatabase extends Dexie {
  messages!: Table<SavedMessage>;
  contacts!: Table<Contact, string>;

  constructor() {
    super('ProjectCipherDB');
    
    // Define database schema and indexes
    this.version(2).stores({
      messages: '++id, to, from, timestamp',
      contacts: 'username'
    });
  }
}

export const db = new CipherDatabase();