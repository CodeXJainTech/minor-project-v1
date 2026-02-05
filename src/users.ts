import bcrypt from "bcryptjs";

interface User {
  username: string;
  passwordHash: string;
}

const users: User[] = [
  {
    username: "userA",
    passwordHash: bcrypt.hashSync("passA", 10),
  },
  {
    username: "userB",
    passwordHash: bcrypt.hashSync("passB", 10),
  },
];

export function authenticate(username: string, password: string): boolean {
  const user = users.find(u => u.username === username);
  if (!user) return false;

  return bcrypt.compareSync(password, user.passwordHash);
}

export function userExists(username: string): boolean {
  return users.some(u => u.username === username);
}
