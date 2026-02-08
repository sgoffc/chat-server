const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

app.use(cors());
app.use(express.json());

/* =========================
   CONEXÃO COM MONGODB
========================= */

// 🔴 TROQUE A SENHA AQUI 🔴
mongoose.connect(
  "mongodb+srv://sgoffc:e%2Dsports@cluster0.ojl9qde.mongodb.net/chat",
  {
    useNewUrlParser: true,
    useUnifiedTopology: true
  }
)
.then(() => console.log("✅ MongoDB conectado"))
.catch(err => console.error("❌ Erro MongoDB:", err));

/* =========================
   MODELO DE MENSAGEM
========================= */

const MessageSchema = new mongoose.Schema({
  user: {
    name: String,
    avatar: String
  },
  text: String,
  time: {
    type: Date,
    default: Date.now
  }
});

const Message = mongoose.model("Message", MessageSchema);

/* =========================
   SOCKET.IO
========================= */

io.on("connection", async socket => {

  console.log("🟢 Usuário conectado");

  // 🔥 Envia histórico ao conectar
  const history = await Message.find()
    .sort({ time: 1 })
    .limit(200);

  socket.emit("history", history);

  socket.on("join", user => {
    socket.user = user;
    io.emit("system", `${user.name} entrou no chat`);
  });

  socket.on("message", async msg => {

    if (!socket.user) return;

    const newMessage = new Message({
      user: socket.user,
      text: msg
    });

    await newMessage.save();

    io.emit("message", newMessage);
  });

  socket.on("disconnect", () => {
    if (socket.user) {
      io.emit("system", `${socket.user.name} saiu`);
    }
  });

});

/* =========================
   SERVIDOR
========================= */

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("🚀 Servidor online na porta " + PORT);
});