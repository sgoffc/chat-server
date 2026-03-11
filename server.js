import express from "express";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import fetch from "node-fetch";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

/* ==================================================
CONFIGURAÇÃO CLOUDFlARE R2
================================================== */
const R2_ACCOUNT_ID = "f530f1401aaabb2e513e985745fe659b";
const R2_ACCESS_KEY = "b0fb8d6bac3fa426f4ed9c6424f25af8";
const R2_SECRET_KEY = "ca313b89eb9303a1b70a140c2162c89902da2784879b41c3bb5e07609b62f8e9";
const R2_BUCKET_NAME = "chat-audio";

async function uploadToR2(filePath, fileName) {
  const data = fs.readFileSync(filePath);
  const url = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET_NAME}/${fileName}`;
  const auth = "Basic " + Buffer.from(`${R2_ACCESS_KEY}:${R2_SECRET_KEY}`).toString("base64");

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": auth,
      "Content-Type": "audio/webm"
    },
    body: data
  });

  if (!response.ok) throw new Error("Erro ao enviar para R2: " + response.statusText);

  return url; // link público direto
}

/* ==================================================
MULTER
================================================== */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "/tmp/"),
  filename: (req, file, cb) => cb(null, Date.now() + ".webm")
});
const upload = multer({ storage });

/* ==================================================
UPLOAD ÁUDIO
================================================== */
app.post("/upload-audio", upload.single("audio"), async (req, res) => {
  try {
    const filePath = req.file.path;
    const fileName = req.file.filename;
    const url = await uploadToR2(filePath, fileName);
    fs.unlink(filePath, () => {});
    res.json({ url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "upload error" });
  }
});

/* ==================================================
MONGODB
================================================== */
mongoose.connect(
  "mongodb+srv://sgoffc:e%2Dsports@cluster0.ojl9qde.mongodb.net/chat"
);

/* ==================================================
SCHEMA
================================================== */
const MessageSchema = new mongoose.Schema({
  user: { name: String, avatar: String },
  text: String,
  audio: String,
  duration: Number,
  time: { type: Date, default: Date.now }
});
const Message = mongoose.model("Message", MessageSchema);

/* ==================================================
SOCKET
================================================== */
io.on("connection", async socket => {
  const history = await Message.find().sort({ time: 1 }).limit(200);
  socket.emit("history", history);

  socket.on("join", user => { socket.user = user; });

  socket.on("message", async msg => {
    const user = socket.user || msg.user;
    const newMessage = new Message({
      user,
      text: msg.text,
      audio: msg.audio,
      duration: msg.duration
    });
    await newMessage.save();
    io.emit("message", newMessage);
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log("Servidor rodando na porta 3000");
});