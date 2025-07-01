const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const multer = require('multer');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.static('public'));

let currentQRImage = null;

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

client.on('qr', async (qr) => {
  currentQRImage = await qrcode.toDataURL(qr);
});

client.on('ready', () => console.log('✅ WhatsApp is ready'));
client.on('authenticated', () => console.log('🔐 Authenticated'));
client.on('auth_failure', msg => console.error('⚠️ Auth failure', msg));

client.initialize();

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/chat.html'));
});

app.get('/qr.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/qr.html'));
});

app.get('/qr', (req, res) => {
  if (!currentQRImage) return res.status(204).end();
  res.send(`<img src="${currentQRImage}" style="width:300px;" />`);
});

app.post('/send-form', upload.single('file'), async (req, res) => {
  const { number, message, caption, type } = req.body;
  const chatId = number.includes('@c.us') ? number : `${number}@c.us`;

  try {
    if (type === 'text') {
      await client.sendMessage(chatId, message);
    } else {
      if (!req.file) return res.status(400).json({ error: 'File not uploaded' });
      const media = MessageMedia.fromFilePath(req.file.path);
      await client.sendMessage(chatId, media, { caption });
    }
    res.json({ status: '✅ Sent successfully!' });
  } catch (err) {
    res.status(500).json({ error: '❌ Failed to send', details: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('🚀 Server ready on port', PORT));
