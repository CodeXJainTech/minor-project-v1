import { Router } from "express";
import { authenticate, userExists } from "./users.js";
import { encrypt } from "./caesar.js";
import { storeMessage, getMessagesForUser } from "./messages.js";

const router = Router();

//login
router.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (!authenticate(username, password)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  res.json({ message: "Login successful" });
});

// for sending
router.post("/send", (req, res) => {
  const { from, to, message } = req.body;

  if (!userExists(from) || !userExists(to)) {
    return res.status(400).json({ error: "User not found" });
  }

  const ciphertext = encrypt(message);

  storeMessage({
    from,
    to,
    ciphertext,
  });

  res.json({
    status: "Encrypted message sent",
    ciphertext,
  });
});

//message fetch karne ke liye
router.get("/messages/:user", (req, res) => {
  const user = req.params.user;

  if (!userExists(user)) {
    return res.status(400).json({ error: "User not found" });
  }

  const msgs = getMessagesForUser(user);

  res.json(msgs);
});

export default router;
