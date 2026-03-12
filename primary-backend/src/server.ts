import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import api from "./api.js";
import { storeMessage } from "./messages.js";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", api);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] } // Allow React to connect
});

// Maps username -> socket.id
const userSockets = new Map<string, string>();

io.on("connection", (socket) => {
  console.log(`New WebSocket connection: ${socket.id}`);

  socket.on("register", (username: string) => {
    userSockets.set(username, socket.id);
    console.log(`${username} registered with socket ${socket.id}`);
  });

  socket.on("private_message", (data: { from: string, to: string, ciphertext: string }) => {
    // 1. Save to in-memory array for history
    storeMessage(data); 
    
    // 2. Route the message to the specific user if they are online
    const receiverSocketId = userSockets.get(data.to);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("receive_message", data);
    }
  });

  socket.on("disconnect", () => {
    for (const [username, id] of userSockets.entries()) {
      if (id === socket.id) {
        userSockets.delete(username);
        console.log(`${username} disconnected.`);
        break;
      }
    }
  });
});

const PORT = 3000;
httpServer.listen(PORT, () => {
  console.log(`Server & WebSockets running on port ${PORT}`);
});