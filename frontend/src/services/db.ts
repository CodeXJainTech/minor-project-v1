import { Dexie, type Table } from 'dexie';

export interface SavedMessage {
  id?: number; // Auto-incremented by Dexie
  payload: string; // Entire message object is JSON stringified and encrypted
}
export interface Contact {
  id: string; // SHA-256 Hash of username
  payload: string; // Encrypted JSON of contact
}

class CipherDatabase extends Dexie {
  messages!: Table<SavedMessage>;
  contacts!: Table<Contact, string>;

  constructor() {
    super('ProjectCipherDB');
    
    // Define database schema and indexes
    this.version(4).stores({
      messages: '++id',
      contacts: 'id'
    });
  }
}

export const db = new CipherDatabase();