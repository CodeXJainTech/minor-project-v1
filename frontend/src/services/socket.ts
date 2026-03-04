import { io } from "socket.io-client";
export const socket = io("http://localhost:3000", { autoConnect: false });
//connecting after a simple login, temp for now