const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const B2 = require("backblaze-b2");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

// ---------------------
// CONFIGURAÇÃO BACKBLAZE B2
// ---------------------
const b2 = new B2({
  applicationKeyId: "7170fed7cff6", // substitua
  applicationKey: "0057584a9d7b30677c1459e479418c03f2bf3ca020",     // substitua
});
const B2_BUCKET_ID = "1771c7e07f7edd879ccf0f16"; // substitua

async function uploadToB2(filePath, fileName){
  await b2.authorize(); // autoriza antes de cada upload

  const uploadUrlResponse = await b2.getUploadUrl({ bucketId: B2_BUCKET_ID });
  const uploadUrl = uploadUrlResponse.data.uploadUrl;
  const uploadAuthToken = uploadUrlResponse.data.authorizationToken;

  const data = fs.readFileSync(filePath);
  await b2.uploadFile({
    uploadUrl,
    uploadAuthToken,
    fileName,
    data,
    contentType: "audio/m4a"
  });

  // URL pública permanente
  return `https://f002.backblazeb2.com/file/chat-audio/${fileName}`; // substitua SEU_BUCKET_NAME
}

// ---------------------
// UPLOAD ÁUDIO
// ---------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

app.post("/upload-audio", upload.single("audio"), async (req, res) => {
  const inputPath = req.file.path;
  const outputFileName = Date.now() + ".m4a";
  const outputPath = path.join("uploads", outputFileName);

  // Converte WebM → AAC/M4A mono 128kbps
  const { exec } = require("child_process");
  exec(`ffmpeg -i "${inputPath}" -c:a aac -b:a 128k -ac 1 "${outputPath}"`, async (err) => {
    fs.unlink(inputPath, ()=>{}); // remove original

    if(err) return res.status(500).json({ error: "Erro na conversão de áudio" });

    try{
      const url = await uploadToB2(outputPath, outputFileName);
      fs.unlink(outputPath, ()=>{}); // remove arquivo local
      res.json({ url });
    } catch(e){
      console.error("Erro B2:", e);
      res.status(500).json({ error: "Erro ao enviar para B2" });
    }
  });
});

// ---------------------
// MONGODB
// ---------------------
mongoose.connect(
  "mongodb+srv://sgoffc:e%2Dsports@cluster0.ojl9qde.mongodb.net/chat",
  { useNewUrlParser: true, useUnifiedTopology: true }
)
.then(()=> console.log("✅ MongoDB conectado"))
.catch(err=> console.error("❌ Erro MongoDB:", err));

// ---------------------
// MODELO DE MENSAGEM
// ---------------------
const MessageSchema = new mongoose.Schema({
  user: { name: String, avatar: String },
  text: String,
  audio: String,
  duration: Number, // duração do áudio
  time: { type: Date, default: Date.now }
});
const Message = mongoose.model("Message", MessageSchema);

// ---------------------
// SOCKET.IO
// ---------------------
io.on("connection", async socket => {
  console.log("🟢 Usuário conectado");

  const history = await Message.find().sort({ time:1 }).limit(200);
  socket.emit("history", history);

  socket.on("join", user => {
    socket.user = user || { name: "Desconhecido", avatar: "" };
    io.emit("system", `${socket.user.name} entrou no chat`);
  });

  socket.on("message", async msg => {
    if(!msg) return;

    let user = socket.user || (msg.user ? msg.user : { name: "Desconhecido", avatar: "" });
    if(!socket.user && msg.user) socket.user = msg.user;

    let newMessage;
    if(typeof msg==="object"){
      newMessage = new Message({
        user,
        text: msg.text || undefined,
        audio: msg.audio || undefined,
        duration: msg.duration || undefined
      });
    } else if(typeof msg==="string"){
      newMessage = new Message({ user, text: msg });
    } else return;

    await newMessage.save();
    io.emit("message", newMessage);
  });

  socket.on("disconnect", ()=>{
    if(socket.user) io.emit("system", `${socket.user.name} saiu`);
  });
});

server.listen(process.env.PORT || 3000, ()=> console.log("🚀 Servidor online"));