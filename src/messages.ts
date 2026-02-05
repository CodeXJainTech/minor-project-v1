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
  return messages.filter(m => m.to === username);
}
