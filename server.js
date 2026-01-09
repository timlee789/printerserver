const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDB, db } = require('./src/config/db');
const printController = require('./src/controllers/printController');

const app = express();
const PORT = 4000;

// 초기화
initDB();

// 미들웨어
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
    res.setHeader("Content-Security-Policy", "default-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src *;");
    next();
});

// 정적 파일 (Admin UI)
app.use(express.static('public'));

// =======================
// 🚦 라우트 정의
// =======================

// 1. 설정 API
app.get('/api/settings', async (req, res) => {
    res.json(await db.getData("/settings"));
});
app.post('/api/settings', async (req, res) => {
    await db.push("/settings", req.body);
    res.json({ success: true });
});

// 2. 프린터 제어 API
app.post('/print', printController.printOrder);
app.post('/api/printer/open-drawer', printController.openDrawer);

// 3. 테스트 API
app.post('/api/test-printer', async (req, res) => {
    const { sendToNetworkPrinter } = require('./src/services/networkService');
    const { ip } = req.body;
    if(!ip) return res.status(400).json({message: "IP Missing"});
    
    const INIT = '\x1b\x40'; const TEXT = 'Connection OK!\n\n\n'; const CUT = '\x1d\x56\x42\x00';
    await sendToNetworkPrinter(ip, INIT + TEXT + CUT, "TEST");
    res.json({ success: true });
});

// 4. Admin 페이지 Fallback
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`🚀 Printer Server Running on Port ${PORT}`));