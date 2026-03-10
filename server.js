const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const path = require("path");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(cors());
app.use(express.json());

/* PASTA PÚBLICA DE ÁUDIOS */
app.use("/uploads", express.static("uploads"));

/* CONFIGURAÇÃO UPLOAD */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + ".webm")
});
const upload = multer({ storage });

/* ROTA DE UPLOAD */
app.post("/upload-audio", upload.single("audio"), (req,res)=>{
  const audioUrl = "https://chat-server-1-gs99.onrender.com/uploads/" + req.file.filename;
  res.json({ url: audioUrl });
});

/* CONEXÃO COM MONGODB */
mongoose.connect(
  "mongodb+srv://sgoffc:e%2Dsports@cluster0.ojl9qde.mongodb.net/chat",
  { useNewUrlParser: true, useUnifiedTopology: true }
)
.then(() => console.log("✅ MongoDB conectado"))
.catch(err => console.error("❌ Erro MongoDB:", err));

/* MODELO DE MENSAGEM */
const MessageSchema = new mongoose.Schema({
  user: { name: String, avatar: String },
  text: String,
  audio: String,
  time: { type: Date, default: Date.now }
});
const Message = mongoose.model("Message", MessageSchema);

/* SOCKET.IO */
io.on("connection", async socket => {
  console.log("🟢 Usuário conectado");

  const history = await Message.find().sort({ time: 1 }).limit(200);
  socket.emit("history", history);

  socket.on("join", user => {
    socket.user = user;
    io.emit("system", `${user.name} entrou no chat`);
  });

  socket.on("message", async msg => {

    if (!socket.user) return;

    let newMessage;

    if(typeof msg === "object" && msg.audio){
        // Áudio
        newMessage = new Message({
            user: socket.user,
            audio: msg.audio
        });
    } else if (typeof msg === "object" && msg.text) {
        // Texto enviado como objeto
        newMessage = new Message({
            user: socket.user,
            text: msg.text
        });
    } else if (typeof msg === "string") {
        // Texto simples
        newMessage = new Message({
            user: socket.user,
            text: msg
        });
    } else {
        return; // ignora formato inválido
    }

    await newMessage.save();
    io.emit("message", newMessage);
  });

  socket.on("disconnect", () => {
    if (socket.user) io.emit("system", `${socket.user.name} saiu`);
  });
});

/* SERVIDOR */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("🚀 Servidor online na porta " + PORT));