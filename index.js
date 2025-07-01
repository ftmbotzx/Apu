
const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');

const app = express();
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

let qrData = null;
let lastChats = [];

const client = new Client({
  authStrategy: new LocalAuth({ clientId: "swadvi" }), // uses folder `.wwebjs_auth`
  puppeteer: { headless: true },
});

client.on('qr', async (qr) => {
  qrData = qr;
  const qrImage = await qrcode.toDataURL(qr);
  const html = \`
    <html><body style="text-align:center;">
    <h2>Scan QR to Login WhatsApp</h2>
    <img src="\${qrImage}" style="width:250px;"/>
    </body></html>
  \`;
  fs.writeFileSync('./public/qr.html', html);
});

client.on('ready', async () => {
  console.log('✅ WhatsApp Ready');
  const chats = await client.getChats();
  lastChats = chats.map(c => ({ id: c.id._serialized, name: c.name || c.formattedTitle || c.id.user }));
  qrData = null;
});

client.initialize();

app.get('/frontend', (req, res) => {
  if (!qrData) return res.redirect('/chat.html');
  res.sendFile(path.join(__dirname, 'public', 'qr.html'));
});

app.get('/chats', (req, res) => {
  res.json(lastChats);
});

app.post('/send', async (req, res) => {
  const { number, type, file_path, caption, message } = req.body;
  const chatId = number.includes('@c.us') ? number : \`\${number}@c.us\`;
  try {
    if (type === 'text') {
      await client.sendMessage(chatId, message);
    } else {
      if (!fs.existsSync(file_path)) return res.status(400).json({ error: 'File not found' });
      const mimeType = mime.lookup(file_path);
      const media = new MessageMedia(mimeType, fs.readFileSync(file_path, 'base64'), path.basename(file_path));
      await client.sendMessage(chatId, media, { caption });
    }
    res.json({ status: '✅ Sent' });
  } catch (e) {
    res.status(500).json({ error: '❌ Failed to send', details: e.message });
  }
});

app.get('/reset', (req, res) => {
  try {
    fs.rmSync(path.join(__dirname, 'wwebjs_auth'), { recursive: true, force: true });
    res.send('🗑️ Session deleted. Restart server and rescan QR.');
  } catch (e) {
    res.status(500).send('❌ Failed to delete session.');
  }
});

let currentQRImage = null;

client.on('qr', async (qr) => {
  currentQRImage = await qrcode.toDataURL(qr);
});

app.get('/qr', (req, res) => {
  if (!currentQRImage) return res.status(204).end();
  res.send(`<img src="${currentQRImage}" style="width:300px;" />`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:\${PORT}`));


// Handle multipart form submission from frontend
app.post('/send-form', upload.single('file'), async (req, res) => {
  const { number, message, caption, type } = req.body;
  const chatId = number.includes('@c.us') ? number : `${number}@c.us`;

  try {
    if (type === 'text') {
      await client.sendMessage(chatId, message);
    } else {
      if (!req.file) return res.status(400).json({ error: 'File not uploaded' });
      const mimeType = mime.lookup(req.file.originalname);
      const media = MessageMedia.fromFilePath(req.file.path);
      await client.sendMessage(chatId, media, { caption });
    }

    res.json({ status: '✅ Sent successfully!' });
  } catch (err) {
    res.status(500).json({ error: '❌ Failed to send', details: err.message });
  }
});
