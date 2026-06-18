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

/* ===============================
CLOUDFLARE R2
=============================== */

const R2_CLIENT = new S3Client({
  endpoint: "https://f530f1401aaabb2e513e985745fe659b.r2.cloudflarestorage.com",
  region: "auto",
  credentials: {
    accessKeyId: "b2dbfd9d20b13d643d1ef41626ef80c4",
    secretAccessKey: "2e185f1e7194f59a9f8c82c4295dcf9aa346f574060831dfe3b7bdebbaa5ce01"
  }
});

const AUDIO_BUCKET = "chat-audio";
const PUBLIC_AUDIO_URL = "https://pub-dda6df999faa4fa1870ab871575ab5d4.r2.dev";

const IMAGE_BUCKET = "chat-image";
const PUBLIC_IMAGE_URL = "https://pub-00926b34f74a46b8b4ea23e9fdbb33af.r2.dev";

/* ===============================
MULTER
=============================== */

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "/tmp/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});

const upload = multer({ storage });

/* ===============================
UPLOAD AUDIO
=============================== */

async function uploadAudioToR2(filePath, fileName) {
  const fileData = fs.readFileSync(filePath);

  await R2_CLIENT.send(new PutObjectCommand({
    Bucket: AUDIO_BUCKET,
    Key: fileName,
    Body: fileData,
    ContentType: "audio/ogg"
  }));

  fs.unlink(filePath, () => {});
  return `${PUBLIC_AUDIO_URL}/${fileName}`;
}

/* ===============================
UPLOAD IMAGE
=============================== */

async function uploadImageToR2(filePath, fileName, mimeType) {
  const fileData = fs.readFileSync(filePath);

  await R2_CLIENT.send(new PutObjectCommand({
    Bucket: IMAGE_BUCKET,
    Key: fileName,
    Body: fileData,
    ContentType: mimeType
  }));

  fs.unlink(filePath, () => {});
  return `${PUBLIC_IMAGE_URL}/${fileName}`;
}

/* ===============================
MONGODB
=============================== */

mongoose.connect("mongodb+srv://sgoffc:e%2Dsports@cluster0.ojl9qde.mongodb.net/chat")
.then(() => console.log("MongoDB conectado"))
.catch(err => console.error(err));

/* ===============================
SCHEMA
=============================== */

const MessageSchema = new mongoose.Schema({
  user: {
    name: String,
    avatar: String
  },
  text: String,
  audio: String,
  image: String,
  duration: Number,
  time: {
    type: Date,
    default: Date.now
  }
});

const Message = mongoose.model("Message", MessageSchema);

/* ===============================
STATUS ONLINE (NOVO)
=============================== */

const usersOnline = new Map(); // socket.id -> user

function broadcastOnlineUsers() {
  const list = Array.from(usersOnline.values());
  io.emit("users-online", list);
}
/* ===============================
STATUS + PRESENÇA (NOVO)
=============================== */

io.on("connection", (socket) => {

  console.log("Usuário conectado:", socket.id);

  socket.user = null;

  /* ===============================
  JOIN (ENTRAR NO CHAT)
  =============================== */

  socket.on("join", (user) => {
    socket.user = {
      ...user,
      id: socket.id,
      lastSeen: Date.now(),
      typing: false,
      recording: false
    };

    usersOnline.set(socket.id, socket.user);
    broadcastOnlineUsers();

    io.emit("user-status", {
      id: socket.id,
      status: "online"
    });
  });

  /* ===============================
  DIGITANDO
  =============================== */

  socket.on("typing", (isTyping) => {
    if (!socket.user) return;

    socket.user.typing = isTyping;
    usersOnline.set(socket.id, socket.user);

    socket.broadcast.emit("typing", {
      id: socket.id,
      name: socket.user.name,
      typing: isTyping
    });
  });

  /* ===============================
  GRAVANDO ÁUDIO
  =============================== */

  socket.on("recording", (isRecording) => {
    if (!socket.user) return;

    socket.user.recording = isRecording;
    usersOnline.set(socket.id, socket.user);

    socket.broadcast.emit("recording", {
      id: socket.id,
      name: socket.user.name,
      recording: isRecording
    });
  });

  /* ===============================
  MENSAGEM (MANTIDO + PEQUENO AJUSTE)
  =============================== */

  socket.on("message", async (msg) => {

    try {

      const user = socket.user || msg.user;

      const newMessage = new Message({
        user,
        text: msg.text || null,
        audio: msg.audio || null,
        image: msg.image || null,
        duration: msg.duration || null
      });

      await newMessage.save();

      io.emit("message", newMessage);

    } catch (err) {
      console.error("Erro salvar mensagem:", err);
    }
  });

  /* ===============================
  DESCONECTAR (LAST SEEN)
  =============================== */

  socket.on("disconnect", () => {

    if (socket.user) {
      socket.user.lastSeen = Date.now();
      usersOnline.set(socket.id, socket.user);

      io.emit("user-status", {
        id: socket.id,
        status: "offline",
        lastSeen: socket.user.lastSeen
      });
    }

    usersOnline.delete(socket.id);
    broadcastOnlineUsers();

    console.log("Usuário desconectado:", socket.id);
  });

});
/* ===============================
MENSAGENS (COM UNREAD BASE)
=============================== */

io.on("connection", async (socket) => {

  /* ===============================
  HISTÓRICO
  =============================== */

  try {
    const history = await Message
      .find()
      .sort({ time: -1 })
      .limit(200)
      .lean();

    socket.emit("history", history.reverse());

  } catch (err) {
    console.error("Erro histórico:", err);
  }

  /* ===============================
  UNREAD SYSTEM (BASE)
  =============================== */

  socket.unreadCount = 0;

  socket.on("mark-read", () => {
    socket.unreadCount = 0;
    socket.emit("unread-reset");
  });

});

/* ===============================
FUNÇÃO AUXILIAR GLOBAL (UNREAD)
=============================== */

function broadcastMessage(msg) {

  io.sockets.sockets.forEach((s) => {
    if (!s.user) return;

    if (!s.handshake || s.id !== msg.socketId) {
      s.unreadCount = (s.unreadCount || 0) + 1;
      s.emit("unread", { count: s.unreadCount });
    }
  });

  io.emit("message", msg);
}