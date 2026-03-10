const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const B2 = require("backblaze-b2");

const app = express();
const server = http.createServer(app);
const io = new Server(server,{ cors:{ origin:"*" } });

app.use(cors());
app.use(express.json());

/* ==================================================
BACKBLAZE
================================================== */

const b2 = new B2({
  applicationKeyId:"7170fed7cff6",
  applicationKey:"0057584a9d7b30677c1459e479418c03f2bf3ca020"
});

const B2_BUCKET_ID="1771c7e07f7edd879ccf0f16";
const B2_BUCKET_NAME="chat-audio";

async function initB2(){
  await b2.authorize();
  console.log("Backblaze autorizado");
}

initB2();

/* ==================================================
UPLOAD B2
================================================== */

async function uploadToB2(filePath,fileName){

  const uploadUrlResponse = await b2.getUploadUrl({
    bucketId:B2_BUCKET_ID
  });

  const uploadUrl = uploadUrlResponse.data.uploadUrl;
  const uploadAuthToken = uploadUrlResponse.data.authorizationToken;

  const data = fs.readFileSync(filePath);

  await b2.uploadFile({
    uploadUrl,
    uploadAuthToken,
    fileName,
    data,
    contentType:"audio/webm"
  });

  /* LINK AGORA PASSA PELO SERVIDOR */
  return `https://chat-server-1-gs99.onrender.com/audio/${fileName}`;
}

/* ==================================================
MULTER
================================================== */

const storage = multer.diskStorage({

  destination:(req,file,cb)=>{
    cb(null,"/tmp/");
  },

  filename:(req,file,cb)=>{
    cb(null,Date.now()+".webm");
  }

});

const upload = multer({ storage });

/* ==================================================
UPLOAD AUDIO
================================================== */

app.post("/upload-audio",upload.single("audio"),async(req,res)=>{

  try{

    const filePath=req.file.path;
    const fileName=req.file.filename;

    const url=await uploadToB2(filePath,fileName);

    fs.unlink(filePath,()=>{});

    res.json({ url });

  }catch(err){

    console.error(err);
    res.status(500).json({ error:"upload error" });

  }

});

/* ==================================================
ROTA PARA SERVIR AUDIO (BUCKET PRIVADO)
================================================== */

app.get("/audio/:file", async (req,res)=>{

  try{

    const fileName=req.params.file;

    const response=await b2.downloadFileByName({
      bucketName:B2_BUCKET_NAME,
      fileName:fileName
    });

    res.setHeader("Content-Type","audio/webm");

    response.data.pipe(res);

  }catch(err){

    console.error(err);
    res.status(404).send("audio error");

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

  user:{
    name:String,
    avatar:String
  },

  text:String,
  audio:String,
  duration:Number,

  time:{
    type:Date,
    default:Date.now
  }

});

const Message = mongoose.model("Message",MessageSchema);

/* ==================================================
SOCKET
================================================== */

io.on("connection",async socket=>{

  const history = await Message.find()
  .sort({time:1})
  .limit(200);

  socket.emit("history",history);

  socket.on("join",user=>{
    socket.user=user;
  });

  socket.on("message",async msg=>{

    let user=socket.user || msg.user;

    const newMessage=new Message({
      user,
      text:msg.text,
      audio:msg.audio,
      duration:msg.duration
    });

    await newMessage.save();

    io.emit("message",newMessage);

  });

});

server.listen(process.env.PORT||3000);