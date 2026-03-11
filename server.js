import express from "express";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

/* ==================================================
CLOUDFLARE R2 CONFIG
================================================== */
const R2_CLIENT = new S3Client({
  endpoint: "https://f530f1401aaabb2e513e985745fe659b.r2.cloudflarestorage.com",
  region: "auto",
  credentials: {
    accessKeyId: "v0j0VG8xMg1XyNKc4Wpwb0hBh5YyrXn7djeKbX4I",
    secretAccessKey: "b0fb8d6bac3fa426f4ed9c6424f25af8"
  }
});
const BUCKET_NAME = "chat-audio";

/* ==================================================
MULTER CONFIG
================================================== */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "/tmp/"),
  filename: (req, file, cb) => cb(null, Date.now() + ".webm")
});
const upload = multer({ storage });

/* ==================================================
UPLOAD AUDIO PARA R2
================================================== */
async function uploadToR2(filePath, fileName) {
  const fileData = fs.readFileSync(filePath);
  await R2_CLIENT.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: fileName,
    Body: fileData,
    ContentType: "audio/webm"
  }));
  return `https://${BUCKET_NAME}.r2.cloudflarestorage.com/${fileName}`;
}

/* ==================================================
UPLOAD AUDIO ROUTE
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
SERVE AUDIO PRIVADO (GET)
================================================== */
app.get("/audio/:file", async (req, res) => {
  try {
    const fileName = req.params.file;

    const data = await R2_CLIENT.send(new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: fileName
    }));

    res.setHeader("Content-Type", "audio/webm");
    data.Body.pipe(res);
  } catch (err) {
    console.error(err);
    res.status(404).send("audio error");
  }
});

/* ==================================================
MONGODB CONFIG
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

/* ==================================================
START SERVER
================================================== */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));