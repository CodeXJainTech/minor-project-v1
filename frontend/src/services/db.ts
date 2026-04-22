import { Dexie, type Table } from 'dexie';

export interface SavedMessage {
  id?: number; // Auto-incremented by Dexie
  from: string;
  to: string;
  ciphertext: string;
  decryptedText: string;
  type: 'text' | 'image';
  timestamp: number;
}

class CipherDatabase extends Dexie {
  messages!: Table<SavedMessage>;

  constructor() {
    super('ProjectCipherDB');
    
    // Define database schema and indexes
    this.version(1).stores({
      messages: '++id, to, from, timestamp'
    });
  }
}

export const db = new CipherDatabase();