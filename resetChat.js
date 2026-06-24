import express from "express";
import { MongoClient } from "mongodb";

const app = express();

const uri = "mongodb+srv://sgoffc:e%2Dsports@cluster0.ojl9qde.mongodb.net/chat";

async function resetChat() {
  const client = new MongoClient(uri);

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

app.get("/reset-chat", async (req, res) => {
  const msg = await resetChat();
  res.send(msg);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor de reset rodando na porta ${PORT}`);
});