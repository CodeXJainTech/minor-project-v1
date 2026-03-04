export interface Message {
  from: string;
  to: string;
  ciphertext: string;
}

const messages: Message[] = [];

export function storeMessage(msg: Message) {
  messages.push(msg);
}

export function getMessagesForUser(username: string): Message[] {
  // Returns messages where the user is the receiver
  return messages.filter(m => m.to === username);
}