const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { JsonDB, Config } = require('node-json-db');

const app = express();
const PORT = 4000;

// 💾 DB 설정 (true, true -> 사람이 읽기 좋게 저장)
const db = new JsonDB(new Config("config", true, true, '/'));

// 🚀 DB 초기화
async function initDB() {
    try {
        await db.getData("/settings");
    } catch (error) {
        await db.push("/settings", {
            printers: {
                kitchen1_ip: "192.168.50.3",
                kitchen2_ip: "192.168.50.19",
                receipt_ip: "192.168.50.20" 
            },
            design: {
                title: "THE COLLEGIATE GRILL",
                footer: "Thank You!",
                show_date: true
            },
            abbreviations: {
                "slaw": "S", "onion": "O", "mayo": "M", "to go": "TO GO", "dine in": "HERE", "ketchup": "K"
            }
        });
    }
}
initDB();

app.use(cors());
app.use(express.json());

// 🛡️ [보안/에러 방지]
app.use((req, res, next) => {
    res.setHeader("Content-Security-Policy", "default-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src *;");
    next();
});
app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => res.sendStatus(200));

// 📂 정적 파일 및 Admin 라우팅
app.use(express.static('public'));
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==========================================
// ⚙️ API 라우트
// ==========================================
app.get('/api/settings', async (req, res) => {
    const data = await db.getData("/settings");
    res.json(data);
});

app.post('/api/settings', async (req, res) => {
    await db.push("/settings", req.body);
    res.json({ success: true });
});

// ==========================================
// 🖨️ 프린터 & 하드웨어 제어 로직
// ==========================================

async function getAbbreviatedMod(name) {
    if (!name) return '';
    const settings = await db.getData("/settings");
    const dict = settings.abbreviations || {};
    let modName = name.trim();
    const lowerName = modName.toLowerCase();
    
    if (dict[lowerName]) return dict[lowerName];
    
    let prefix = "";
    if (lowerName.startsWith("no ")) { prefix = "NO "; modName = modName.substring(3).trim(); }
    else if (lowerName.startsWith("add ")) { prefix = "ADD "; modName = modName.substring(4).trim(); }
    
    return prefix + modName.charAt(0).toUpperCase() + modName.slice(1);
}

function formatCloverDate(dateObj) {
    const day = dateObj.getDate().toString().padStart(2, '0');
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${day}-${monthNames[dateObj.getMonth()]}-${dateObj.getFullYear()}`;
}

// 🌐 네트워크 프린터 전송 함수 (기본)
function sendToNetworkPrinter(ip, buffer, label) {
    return new Promise((resolve) => {
        if (!ip || ip === "0.0.0.0") { resolve(); return; }
        
        console.log(`⏳ [${label}] 전송 시도 -> ${ip}:9100`);
        const client = new net.Socket();
        client.setTimeout(5000);
        
        client.connect(9100, ip, () => {
            client.write(Buffer.from(buffer));
            client.end();
        });

        client.on('close', () => { console.log(`✅ [${label}] 완료`); resolve(); });
        client.on('error', (err) => { console.error(`❌ [${label}] 오류: ${err.message}`); client.destroy(); resolve(); });
        client.on('timeout', () => { console.error(`❌ [${label}] 타임아웃`); client.destroy(); resolve(); });
    });
}

// ✨ [NEW] 돈통 열기 함수 (Open Cash Drawer)
function openCashDrawer(ip, port = 9100) {
    return new Promise((resolve, reject) => {
        if (!ip) {
            console.error("❌ Printer IP missing for Cash Drawer");
            return resolve(false); 
        }

        const client = new net.Socket();
        client.setTimeout(3000);

        client.connect(port, ip, () => {
            console.log(`💵 [CashDrawer] Opening at ${ip}...`);

            // ESC/POS Command: ESC p m t1 t2
            // 0x1B 0x70 0x00(Pin2) 0x19(50ms) 0x78(240ms)
            const openCommand = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0x78]);
            
            // 혹시 Pin 5번을 사용하는 모델일 경우를 대비해 둘 다 보내기도 함
            // const openCommandPin5 = Buffer.from([0x1B, 0x70, 0x01, 0x19, 0x78]);
            
            client.write(openCommand, () => {
                console.log('✅ Drawer Signal Sent');
                client.end();
                resolve(true);
            });
        });

        client.on('error', (err) => {
            console.error('❌ Drawer Error:', err.message);
            client.destroy();
            resolve(false); // 에러나도 서버 죽지 않게 false 반환
        });

        client.on('timeout', () => {
            console.error('❌ Drawer Timeout');
            client.destroy();
            resolve(false);
        });
    });
}


// 🎨 주방 버퍼 생성
async function generateKitchenBuffer(items, tableNumber, title) {
    const settings = await db.getData("/settings");
    const INIT = '\x1b\x40'; const RED = '\x1b\x34'; const BLACK = '\x1b\x35';
    const ALIGN_CENTER = '\x1b\x1d\x61\x01'; const ALIGN_LEFT = '\x1b\x1d\x61\x00'; const ALIGN_RIGHT = '\x1b\x1d\x61\x02';
    const CUT = '\x1b\x64\x02'; const BIG_FONT = '\x1b\x57\x01\x1b\x68\x01';

    const now = new Date();
    const dateStr = formatCloverDate(now);
    const timeStr = now.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit' }).replace(' PM', 'P').replace(' AM', 'A');
    const displayOrderNum = (tableNumber && tableNumber !== 'To Go') ? tableNumber : "00";
    const typeText = (tableNumber && tableNumber !== 'To Go') ? "Dine In" : "To Go";

    let buffer = INIT + ALIGN_CENTER + BLACK + BIG_FONT + `${title}\n` + `ORDER: ${displayOrderNum}\n` + RED + `${typeText}\n` + ALIGN_LEFT + BLACK + `${dateStr} ${timeStr}\nServer: Kiosk\n----------------\n`;

    for (const item of items) {
        const qty = item.quantity || 1;
        const name = item.pos_name || item.name;
        const displayName = qty > 1 ? `${qty} ${name}` : name;
        buffer += ALIGN_LEFT + BLACK + displayName + "\n";
        
        let modifiers = item.selectedModifiers || item.options || item.modifiers || [];
        if (modifiers.length > 0) {
            buffer += ALIGN_RIGHT + RED;
            for (const mod of modifiers) {
                let originalName = (typeof mod === 'string') ? mod : (mod.name || mod.label);
                buffer += `${await getAbbreviatedMod(originalName)}\n`;
            }
            buffer += ALIGN_LEFT + BLACK;
        }
    }
    buffer += "----------------\n" + `ID: ${displayOrderNum}\n` + "\n\n\n" + CUT;
    return buffer;
}

// 🎨 영수증 버퍼 생성
async function generateReceiptBuffer(data) {
    const settings = await db.getData("/settings");
    const { items, tableNumber, subtotal, tax, tipAmount, totalAmount, date, orderType } = data;
    const displayOrderNum = (tableNumber && tableNumber !== 'To Go') ? tableNumber : "To Go";
    const displayType = (orderType === 'dine_in') ? "Dine In" : "To Go";

    const ESC = '\x1b'; const ALIGN_CENTER = '\x1b\x61\x01'; const ALIGN_LEFT = '\x1b\x61\x00'; const ALIGN_RIGHT = '\x1b\x61\x02'; const BOLD_ON = '\x1b\x45\x01'; const BOLD_OFF = '\x1b\x45\x00'; const DOUBLE_HEIGHT = '\x1b\x21\x10'; const NORMAL = '\x1b\x21\x00'; const CUT = '\x1d\x56\x42\x00';

    let buffer = ESC + '@' + ALIGN_CENTER + BOLD_ON + `${settings.design.title}\n` + BOLD_OFF + NORMAL + "Customer Receipt\n" + DOUBLE_HEIGHT + `[ ${displayType} ]\n` + NORMAL + `Date: ${date}\n--------------------------------\n` + ALIGN_LEFT + DOUBLE_HEIGHT + BOLD_ON + (displayOrderNum === "To Go" ? "Order Type: To Go\n" : `Order #: ${displayOrderNum}\n`) + NORMAL + BOLD_OFF + "--------------------------------\n";

    items.forEach(item => {
        const qty = item.quantity || 1;
        const price = (item.totalPrice || 0).toFixed(2);
        buffer += BOLD_ON + `${qty} ${item.name}` + BOLD_OFF + "\n";
        let modifiers = item.selectedModifiers || item.options || item.modifiers || [];
        if (modifiers.length > 0) {
            modifiers.forEach(mod => {
                 let modName = (typeof mod === 'string') ? mod : (mod.name || mod.label);
                 buffer += `   + ${modName} ($${(mod.price || 0).toFixed(2)})\n`;
            });
        }
        buffer += ALIGN_RIGHT + `$${price}\n` + ALIGN_LEFT;
    });

    buffer += "--------------------------------\n" + ALIGN_RIGHT + `Subtotal: $${(subtotal || 0).toFixed(2)}\n` + `Tax: $${(tax || 0).toFixed(2)}\n`;
    if (tipAmount > 0) buffer += BOLD_ON + `Tip: $${tipAmount.toFixed(2)}\n` + BOLD_OFF;
    buffer += "--------------------------------\n" + DOUBLE_HEIGHT + BOLD_ON + `TOTAL: $${(totalAmount || 0).toFixed(2)}\n` + NORMAL + BOLD_OFF + ALIGN_CENTER + `\n\n${settings.design.footer}\n\n\n\n\n` + CUT;
    return buffer;
}


// ==========================================
// 🚀 API 라우트
// ==========================================

// 1. 프린터 연결 테스트
app.post('/api/test-printer', async (req, res) => {
    const { ip, port } = req.body; 

    if (!ip) {
        return res.status(400).json({ success: false, message: "IP Address is missing" });
    }

    console.log(`🧪 [테스트] IP: ${ip} 로 연결 시도 중...`);
    const INIT = '\x1b\x40';
    const TEXT = 'Connection OK!\nTest Print Successful.\n\n\n';
    const CUT = '\x1d\x56\x42\x00';
    const buffer = INIT + TEXT + CUT;

    try {
        await sendToNetworkPrinter(ip, buffer, "TEST-PRINT");
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ✨ [NEW] 2. 돈통 열기 API (POS 연동용)
app.post('/api/printer/open-drawer', async (req, res) => {
    const { printerIp } = req.body; 

    if (!printerIp) {
        return res.status(400).json({ success: false, message: 'Printer IP required' });
    }

    try {
        await openCashDrawer(printerIp);
        res.json({ success: true, message: 'Drawer Open Signal Sent' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 3. 주문 출력 (메인)
app.post('/print', async (req, res) => {
    const settings = await db.getData("/settings");
    const { items, totalAmount } = req.body;
    
    console.log(`🖨️ [주문 접수] Table: ${req.body.tableNumber}`);

    const milkshakeItems = [], kitchenItems = [];
    if (items) {
        items.forEach(item => {
            const fullName = (item.name + " " + (item.pos_name || "")).toLowerCase();
            if (fullName.includes('milkshake') || fullName.includes('shake')) milkshakeItems.push(item);
            else kitchenItems.push(item);
        });
    }

    const promises = [];

    // 1. 주방
    if (kitchenItems.length > 0) {
        promises.push(sendToNetworkPrinter(settings.printers.kitchen1_ip, await generateKitchenBuffer(kitchenItems, req.body.tableNumber, "KITCHEN"), "Kitchen 1"));
    }

    // 2. 쉐이크
    if (milkshakeItems.length > 0) {
        promises.push(sendToNetworkPrinter(settings.printers.kitchen2_ip, await generateKitchenBuffer(milkshakeItems, req.body.tableNumber, "MILKSHAKE"), "Kitchen 2"));
    }

    // 3. 영수증
    if (totalAmount > 0) {
        promises.push(sendToNetworkPrinter(settings.printers.receipt_ip, await generateReceiptBuffer(req.body), "Receipt"));
    }

    try {
        await Promise.all(promises);
        res.json({ success: true });
    } catch (e) {
        console.error("Print Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => console.log(`🚀 Printer Server Admin: http://localhost:${PORT}/admin`));