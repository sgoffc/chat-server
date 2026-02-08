const { MongoClient } = require("mongodb");

// Aqui é o seu URI do Atlas
const uri = "mongodb+srv://sgoffc:e%2Dsports@cluster0.ojl9qde.mongodb.net/chat";
const client = new MongoClient(uri);

async function resetChat() {
  try {
    await client.connect();

    const db = client.db("chat");         // Nome do banco
    const messages = db.collection("messages"); // Nome da coleção do chat

    // Apaga todas as mensagens
    const result = await messages.deleteMany({});
    console.log(`Histórico apagado: ${result.deletedCount} mensagens removidas.`);
    
  } catch (err) {
    console.error("Erro ao resetar chat:", err);
  } finally {
    await client.close();
  }
}

// Executa a função
resetChat();