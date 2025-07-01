const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

let currentQR = null;

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox']
    }
});

client.on('qr', async (qr) => {
    currentQR = await qrcode.toDataURL(qr);
    console.log('📷 QR generated. Open /qr in browser to scan.');
});

client.on('ready', () => {
    currentQR = null;
    console.log('✅ WhatsApp client is ready!');
});

client.initialize();

app.get('/qr', (req, res) => {
    if (currentQR) {
        res.send(`
            <html>
                <body style="display:flex;flex-direction:column;align-items:center;margin-top:100px">
                    <h2>Scan this QR Code with WhatsApp</h2>
                    <img src="${currentQR}" />
                </body>
            </html>
        `);
    } else {
        res.send('<h3>✅ Already Logged In</h3>');
    }
});

app.post('/send-message', async (req, res) => {
    const { phone, message } = req.body;

    if (!phone || !message) {
        return res.status(400).json({ error: 'Missing phone or message' });
    }

    try {
        const chatId = `${phone}@c.us`;
        await client.sendMessage(chatId, message);
        return res.json({ success: true, message: 'Message sent!' });
    } catch (err) {
        console.error('❌ Error:', err);
        return res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server running: http://localhost:${PORT}`);
});
