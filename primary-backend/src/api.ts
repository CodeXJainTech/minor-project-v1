import { Router } from "express";
import { authenticate, userExists } from "./users.js";
import { getMessagesForUser } from "./messages.js";

const router = Router();

router.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (!authenticate(username, password)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  res.json({ message: "Login successful", username });
});

router.get("/messages/:user", (req, res) => {
  const user = req.params.user;
  if (!userExists(user)) {
    return res.status(400).json({ error: "User not found" });
  }
  res.json(getMessagesForUser(user));
});

export default router;