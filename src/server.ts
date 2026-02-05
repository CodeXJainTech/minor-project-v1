import express from "express";
import cors from "cors";
import api from "./api.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api", api);

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`Server at ${PORT}`);
});
