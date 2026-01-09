// src/services/networkService.js
const net = require('net');

function sendToNetworkPrinter(ip, bufferString, label) {
    return new Promise((resolve) => {
        if (!ip || ip === "0.0.0.0") { 
            console.log(`⚠️ [${label}] IP 미설정`);
            return resolve(); 
        }

        console.log(`⏳ [${label}] 전송 -> ${ip}:9100`);
        const client = new net.Socket();
        client.setTimeout(4000);

        const dataBuffer = Buffer.from(bufferString, 'binary');

        client.connect(9100, ip, () => {
            client.write(dataBuffer);
            client.end();
        });

        client.on('close', () => resolve());
        client.on('error', (err) => { 
            console.error(`❌ [${label}] 실패: ${err.message}`); 
            client.destroy(); resolve(); 
        });
        client.on('timeout', () => { 
            console.error(`❌ [${label}] 타임아웃`); 
            client.destroy(); resolve(); 
        });
    });
}

function openCashDrawer(ip, port = 9100) {
    return new Promise((resolve) => {
        if (!ip) return resolve(false);
        const client = new net.Socket();
        client.setTimeout(3000);
        
        client.connect(port, ip, () => {
            // ESC p 0 25 120 (핀 2번 오픈)
            const openCommand = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0x78]);
            client.write(openCommand, () => {
                client.end();
                resolve(true);
            });
        });
        
        client.on('error', () => { client.destroy(); resolve(false); });
        client.on('timeout', () => { client.destroy(); resolve(false); });
    });
}

module.exports = { sendToNetworkPrinter, openCashDrawer };