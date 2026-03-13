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
CLOUDFLARE R2
================================================== */
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

/* ==================================================
MULTER
================================================== */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "/tmp/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});

const upload = multer({ storage });

/* ==================================================
UPLOAD R2
================================================== */

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

/* ==================================================
ROTAS UPLOAD
================================================== */

app.post("/upload-audio", upload.single("audio"), async (req, res) => {

  try {

    const filePath = req.file.path;
    const fileName = req.file.filename;

    const url = await uploadAudioToR2(filePath, fileName);

    res.json({ url });

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: "upload error" });

  }

});

app.post("/upload-image", upload.single("image"), async (req, res) => {

  try {

    const filePath = req.file.path;
    const fileName = req.file.filename;
    const mimeType = req.file.mimetype;

    const url = await uploadImageToR2(filePath, fileName, mimeType);

    res.json({ url });

  } catch (err) {

    console.error("Upload imagem falhou:", err);
    res.status(500).json({ error: "upload error" });

  }

});

/* ==================================================
MONGODB
================================================== */

mongoose.connect("mongodb+srv://sgoffc:e%2Dsports@cluster0.ojl9qde.mongodb.net/chat")
.then(() => console.log("✅ MongoDB conectado"))
.catch(err => console.error("❌ MongoDB erro:", err));

/* ==================================================
MODELO MENSAGEM (TUDO EM UM)
================================================== */

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

/* ==================================================
SOCKET
================================================== */

io.on("connection", async socket => {

  console.log("🟢 Usuário conectado");

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

  socket.on("join", user => {

    socket.user = user;

  });

  socket.on("message", async msg => {

    try {

      const user = socket.user || msg.user;

      const newMessage = new Message({

        user,
        text: msg.text,
        audio: msg.audio,
        image: msg.image,
        duration: msg.duration

      });

      await newMessage.save();

      io.emit("message", newMessage);

    } catch (err) {

      console.error("Erro salvar mensagem:", err);

    }

  });

});

/* ==================================================
START SERVER
================================================== */

server.listen(process.env.PORT || 3000, () => {

  console.log("🚀 Servidor online");

});