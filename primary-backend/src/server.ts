import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import api from "./api.js";
import { prisma } from "./db.js";
import path from "path";
import { fileURLToPath } from "url";
import helmet from "helmet";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ALLOWED_ORIGINS = [`${process.env.FRONTEND_URL}`];
const app = express();
app.use(helmet());
app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
  }),
);
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));
app.use("/api", api);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
  },
});

// Track online users: Map<Username, SocketID>
const onlineUsers = new Map<string, string>();

io.on("connection", (socket) => {
  console.log(`[+] Socket connected: ${socket.id}`);

  // Register socket and deliver offline messages
  socket.on("register_socket", async (username: string) => {
    console.log(`[Socket] ${username} connected with ID: ${socket.id}`);
    onlineUsers.set(username, socket.id);

    try {
      const offlineMessages = await prisma.queuedMessage.findMany({
        where: { to: username },
        orderBy: { createdAt: "asc" },
      });

      if (offlineMessages.length > 0) {
        console.log(
          `[Queue] Delivering ${offlineMessages.length} offline messages to ${username}`,
        );

        offlineMessages.forEach((msg) => {
          socket.emit("receive_message", {
            from: msg.from,
            ciphertext: msg.ciphertext,
            encryptedAesKey: msg.encryptedAesKey,
          });
        });

        await prisma.queuedMessage.deleteMany({
          where: { to: username },
        });
      }
    } catch (error) {
      console.error("[Queue] Error delivering offline messages:", error);
    }
  });

  // Handle user disconnect
  socket.on("disconnect", () => {
    for (const [username, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        onlineUsers.delete(username);
        console.log(`[Socket] ${username} disconnected.`);
        break;
      }
    }
  });

  // Route private messages
  socket.on("private_message", async (payload) => {
    const targetSocketId = onlineUsers.get(payload.to);

    if (targetSocketId) {
      // Deliver instantly if online
      console.log(
        `[Router] Instant delivery from ${payload.from} to ${payload.to}`,
      );
      io.to(targetSocketId).emit("receive_message", payload);
    } else {
      // Queue message if offline
      console.log(`[Router] ${payload.to} is offline. Saving to queue.`);
      try {
        await prisma.queuedMessage.create({
          data: {
            from: payload.from,
            to: payload.to,
            ciphertext: payload.ciphertext,
            encryptedAesKey: payload.encryptedAesKey,
          },
        });
      } catch (error) {
        console.error("[Router] Failed to queue offline message:", error);
      }
    }
  });

  // Fetch public key for a user
  socket.on("request_public_key", async (targetUsername: string, callback) => {
    try {
      const targetUser = await prisma.user.findUnique({
        where: { username: targetUsername },
      });

      if (targetUser && targetUser.identityKeyPub) {
        callback({ success: true, publicKey: targetUser.identityKeyPub });
      } else {
        callback({
          success: false,
          error: "User not registered or missing key.",
        });
      }
    } catch (err) {
      console.error("[Socket] DB Error fetching key:", err);
      callback({ success: false, error: "Server error fetching key." });
    }
  });

  // Forward friend request
  socket.on("send_friend_request", (data) => {
    const { sender, receiver } = data;
    const targetSocketId = onlineUsers.get(receiver);
    if (targetSocketId) {
      io.to(targetSocketId).emit("receive_friend_request", sender);
    }
  });

  // Forward friend request acceptance
  socket.on("accept_friend_request", (data) => {
    const { sender, receiver } = data;
    const senderSocketId = onlineUsers.get(sender);

    if (senderSocketId) {
      io.to(senderSocketId).emit("request_accepted", receiver);
    }
  });

  // Forward friend request rejection
  socket.on("reject_friend_request", (data) => {
    const { sender, receiver } = data;
    const senderSocketId = onlineUsers.get(sender);

    if (senderSocketId) {
      io.to(senderSocketId).emit("request_rejected", receiver);
    }
  });

  // Notify user when blocked
  socket.on("block_user", (data) => {
    const { blocker, blocked } = data;
    const blockedSocketId = onlineUsers.get(blocked);

    if (blockedSocketId) {
      io.to(blockedSocketId).emit("user_blocked_you", blocker);
    }
  });
});

async function startServer() {
  try {
    console.log("[DB] Verifying Prisma connection...");
    await prisma.$connect();
    const userCount = await prisma.user.count();
    console.log(
      `[DB] Database connected successfully. Current users: ${userCount}`,
    );

    const PORT = process.env.PORT || 3000;
    httpServer.listen(PORT, () =>
      console.log(`Secure Blind Router running on port ${PORT}`),
    );
  } catch (error) {
    console.error("[DB] CRITICAL: Failed to connect to database!", error);
    process.exit(1);
  }
}

startServer();