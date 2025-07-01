const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Initialize SQLite
const db = new Database('./data.db');
db.prepare(`
  CREATE TABLE IF NOT EXISTS session_info (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT,
    pushname TEXT,
    platform TEXT,
    last_connected DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

let currentQRImage = null;

const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: './session' // Custom session path
  }),
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

client.on('qr', async (qr) => {
  currentQRImage = await qrcode.toDataURL(qr);
});

client.on('ready', () => {
  console.log('✅ WhatsApp is ready');

  const { wid, pushname, platform } = client.info;

  db.prepare(`
    INSERT INTO session_info (number, pushname, platform)
    VALUES (?, ?, ?)
  `).run(wid.user, pushname, platform);
});

client.on('authenticated', () => console.log('🔐 Authenticated'));
client.on('auth_failure', msg => console.error('⚠️ Auth failure:', msg));

client.initialize();

// Home Page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/chat.html'));
});

// QR Page
app.get('/qr.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/qr.html'));
});

// QR Image
app.get('/qr', (req, res) => {
  if (!currentQRImage) return res.status(204).end();
  res.send(`<img src="${currentQRImage}" style="width:300px;" />`);
});

// Send from HTML form
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
      fs.unlinkSync(req.file.path); // delete uploaded file
    }
    res.json({ status: '✅ Sent successfully!' });
  } catch (err) {
    res.status(500).json({ error: '❌ Failed to send', details: err.message });
  }
});

// Send via JSON API
app.post('/send-message', async (req, res) => {
  const { number, message, type, filePath, caption } = req.body;
  const chatId = number.includes('@c.us') ? number : `${number}@c.us`;

  try {
    if (type === 'text') {
      await client.sendMessage(chatId, message);
    } else if (type === 'media') {
      if (!filePath) return res.status(400).json({ error: 'Missing filePath for media' });
      const media = MessageMedia.fromFilePath(filePath);
      await client.sendMessage(chatId, media, { caption });
    } else {
      return res.status(400).json({ error: 'Invalid message type' });
    }

    res.json({ status: '✅ Message sent successfully' });
  } catch (err) {
    console.error('Send error:', err);
    res.status(500).json({ error: '❌ Failed to send', details: err.message });
  }
});

// Status API
app.get('/status', (req, res) => {
  const connected = client.info && client.info.wid ? true : false;
  res.json({
    connected,
    number: client.info?.wid?.user || null,
    platform: client.info?.platform || null,
    pushname: client.info?.pushname || null
  });
});

// Get session info from DB
app.get('/db-session', (req, res) => {
  try {
    const session = db.prepare(`SELECT * FROM session_info ORDER BY id DESC LIMIT 1`).get();
    if (!session) return res.status(404).json({ message: 'No session stored in DB yet.' });
    res.json({ session });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('🚀 Server ready on port', PORT));
