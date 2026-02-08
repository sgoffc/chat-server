const express = require("express");
const { MongoClient } = require("mongodb");
const app = express();

// Seu URI do Atlas
const uri = "mongodb+srv://sgoffc:e%2Dsports@cluster0.ojl9qde.mongodb.net/chat";
const client = new MongoClient(uri);

async function resetChat() {
  try {
    await client.connect();

    const db = client.db("chat");                
    const messages = db.collection("messages");  

    const result = await messages.deleteMany({}); 
    console.log(`Histórico apagado: ${result.deletedCount} mensagens removidas.`);
    return `Histórico apagado: ${result.deletedCount} mensagens removidas.`;

  } catch (err) {
    console.error("Erro ao resetar chat:", err);
    return "Erro ao resetar chat.";
  } finally {
    await client.close();
  }
}

// Aqui é a rota HTTP para chamar pelo botão do site
app.get("/reset-chat", async (req, res) => {
  const msg = await resetChat();
  res.send(msg);
});

// Porta padrão do Render
app.listen(process.env.PORT || 3000, () => {
  console.log("Servidor de reset rodando!");
});