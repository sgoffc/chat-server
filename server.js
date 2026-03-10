const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

/* =====================
UPLOAD ÁUDIO
===================== */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + ".webm")
});
const upload = multer({ storage });

app.post("/upload-audio", upload.single("audio"), (req,res)=>{
  res.json({ url: "https://chat-server-1-gs99.onrender.com/uploads/" + req.file.filename });
});

/* =====================
MONGODB
===================== */
mongoose.connect(
  "mongodb+srv://sgoffc:e%2Dsports@cluster0.ojl9qde.mongodb.net/chat",
  { useNewUrlParser: true, useUnifiedTopology: true }
)
.then(()=> console.log("✅ MongoDB conectado"))
.catch(err=> console.error("❌ Erro MongoDB:", err));

/* =====================
MODELO DE MENSAGEM
===================== */
const MessageSchema = new mongoose.Schema({
  user: { name: String, avatar: String },
  text: String,
  audio: String,
  time: { type: Date, default: Date.now }
});
const Message = mongoose.model("Message", MessageSchema);

/* =====================
SOCKET.IO
===================== */
io.on("connection", async socket => {
  console.log("🟢 Usuário conectado");

  // Envia histórico
  const history = await Message.find().sort({ time:1 }).limit(200);
  socket.emit("history", history);

  // Registrar usuário
  socket.on("join", user => {
    socket.user = user || { name: "Desconhecido", avatar: "" };
    io.emit("system", `${socket.user.name} entrou no chat`);
  });

  // Receber mensagens
  socket.on("message", async msg => {
    if(!msg) return;

    // Corrige usuário: pega socket.user ou msg.user
    let user = socket.user || (msg.user ? msg.user : { name: "Desconhecido", avatar: "" });

    // Atualiza socket.user se ainda não tinha
    if(!socket.user && msg.user) socket.user = msg.user;

    let newMessage;
    if(typeof msg === "object"){
      newMessage = new Message({
        user,
        text: msg.text || undefined,
        audio: msg.audio || undefined
      });
    } else if(typeof msg === "string") {
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