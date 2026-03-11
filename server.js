import express from "express";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

/* ==================================================
CLOUDflare R2
================================================== */

const s3 = new S3Client({
  endpoint: "https://f530f1401aaabb2e513e985745fe659b.r2.cloudflarestorage.com",
  region: "auto",
  credentials: {
    accessKeyId: "v0j0VG8xMg1XyNKc4Wpwb0hBh5YyrXn7djeKbX4I",
    secretAccessKey: "b0fb8d6bac3fa426f4ed9c6424f25af8"
  }
});

async function uploadToR2(filePath, fileName) {
  const fileStream = fs.createReadStream(filePath);
  await s3.send(new PutObjectCommand({
    Bucket: "chat-audio",
    Key: fileName,
    Body: fileStream,
    ContentType: "audio/webm",
  }));
  return `https://f530f1401aaabb2e513e985745fe659b.r2.cloudflarestorage.com/chat-audio/${fileName}`;
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
UPLOAD AUDIO
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
    res.status(500).json({ error: "Erro ao enviar áudio" });
  }
});

/* ==================================================
MONGODB
================================================== */

mongoose.connect("mongodb+srv://sgoffc:e%2Dsports@cluster0.ojl9qde.mongodb.net/chat");

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
SOCKET.IO
================================================== */

io.on("connection", async socket => {
  const history = await Message.find().sort({ time: 1 }).limit(200);
  socket.emit("history", history);

  socket.on("join", user => socket.user = user);

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

/* ==================================================
START SERVER
================================================== */

server.listen(process.env.PORT || 3000, () => {
  console.log("Servidor rodando na porta", process.env.PORT || 3000);
});