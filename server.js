const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

io.on("connection", socket => {

  socket.on("join", user => {
    socket.user = user;
    io.emit("system", `${user.name} entrou no chat`);
  });

  socket.on("message", msg => {
    io.emit("message", {
      user: socket.user,
      text: msg,
      time: Date.now()
    });
  });

  socket.on("disconnect", () => {
    if (socket.user) {
      io.emit("system", `${socket.user.name} saiu`);
    }
  });

});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Servidor online");
});
