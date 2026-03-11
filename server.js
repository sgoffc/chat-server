const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const fetch = require("node-fetch");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

/* ==================================================
CLOUD FLARE R2
================================================== */
const R2_ACCOUNT_ID = "f530f1401aaabb2e513e985745fe659b"; // seu account id
const R2_ACCESS_KEY = "v0j0VG8xMg1XyNKc4Wpwb0hBh5YyrXn7djeKbX4I"; // key
const R2_SECRET_KEY = "b0fb8d6bac3fa426f4ed9c6424f25af8"; // secret
const R2_BUCKET = "chat-audio";
const R2_ENDPOINT = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

/* ==================================================
MULTER PARA UPLOAD
================================================== */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "/tmp/"),
  filename: (req, file, cb) => cb(null, Date.now() + ".webm"),
});
const upload = multer({ storage });

/* ==================================================
UPLOAD PARA R2
================================================== */
async function uploadToR2(filePath, fileName) {
  const data = fs.readFileSync(filePath);

  const res = await fetch(`${R2_ENDPOINT}/${R2_BUCKET}/${fileName}`, {
    method: "PUT",
    body: data,
    headers: {
      "Content-Type": "audio/webm",
      "Authorization": `Basic ${Buffer.from(R2_ACCESS_KEY + ":" + R2_SECRET_KEY).toString("base64")}`,
    },
  });

  if (!res.ok) throw new Error("Erro ao enviar para R2");

  return `${R2_ENDPOINT}/${R2_BUCKET}/${fileName}`;
}

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
  time: { type: Date, default: Date.now },
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
    let user = socket.user || msg.user;
    const newMessage = new Message({
      user,
      text: msg.text,
      audio: msg.audio,
      duration: msg.duration,
    });
    await newMessage.save();
    io.emit("message", newMessage);
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log("Servidor rodando na porta 3000");
});