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

// ---------------------
// CLOUD FLARE R2 CONFIG
// ---------------------
const R2_CLIENT = new S3Client({
  endpoint: "https://f530f1401aaabb2e513e985745fe659b.r2.cloudflarestorage.com",
  region: "auto",
  credentials: {
    accessKeyId: "b2dbfd9d20b13d643d1ef41626ef80c4",
    secretAccessKey: "2e185f1e7194f59a9f8c82c4295dcf9aa346f574060831dfe3b7bdebbaa5ce01"
  }
});

const BUCKET_NAME = "chat-audio";

// 🔥 URL pública correta do bucket
const PUBLIC_AUDIO_URL = "https://pub-dda6df999faa4fa1870ab871575ab5d4.r2.dev";

// ---------------------
// MULTER CONFIG
// ---------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "/tmp/"),
  filename: (req, file, cb) => cb(null, Date.now() + ".ogg") // alterado
});

const upload = multer({ storage });

// ---------------------
// FUNÇÃO UPLOAD R2
// ---------------------
async function uploadToR2(filePath, fileName) {

  const fileData = fs.readFileSync(filePath);

  await R2_CLIENT.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: fileName,
    Body: fileData,
    ContentType: "audio/ogg" // alterado
  }));

  fs.unlink(filePath, () => {});

  return `${PUBLIC_AUDIO_URL}/${fileName}`;
}

// ---------------------
// ROTA UPLOAD ÁUDIO
// ---------------------
app.post("/upload-audio", upload.single("audio"), async (req, res) => {
  try {

    const filePath = req.file.path;
    const fileName = req.file.filename;

    const url = await uploadToR2(filePath, fileName);

    res.json({ url });

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: "upload error" });

  }
});

// ---------------------
// MONGODB
// ---------------------
mongoose.connect("mongodb+srv://sgoffc:e%2Dsports@cluster0.ojl9qde.mongodb.net/chat")
.then(() => console.log("✅ MongoDB conectado"))
.catch(err => console.error("❌ MongoDB erro:", err));

// ---------------------
// MODELO MENSAGEM
// ---------------------
const MessageSchema = new mongoose.Schema({

  user: {
    name: String,
    avatar: String
  },

  text: String,
  audio: String,
  duration: Number,

  time: {
    type: Date,
    default: Date.now
  }

});

const Message = mongoose.model("Message", MessageSchema);

// ---------------------
// SOCKET.IO
// ---------------------
io.on("connection", async socket => {

  console.log("🟢 Usuário conectado");

  const history = await Message.find()
  .sort({ time: -1 })
  .limit(200)
  .lean();

  socket.emit("history", history.reverse());

  socket.on("join", user => {
    socket.user = user;
  });

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

// ---------------------
// START SERVER
// ---------------------
server.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Servidor online");
});