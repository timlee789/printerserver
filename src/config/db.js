// src/config/db.js
const { JsonDB, Config } = require('node-json-db');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(process.cwd(), "config.json");
const db = new JsonDB(new Config(dbPath, true, true, '/'));

async function initDB() {
    if (!fs.existsSync(dbPath)) {
        console.log("🆕 설정 파일이 없어 새로 생성합니다. (Safe Mode)");
        const initialData = {
            settings: {
                printers: {
                    kitchen1_ip: "192.168.50.3",
                    kitchen2_ip: "192.168.50.19",
                    receipt_ip: "192.168.50.201"
                },
                design: {
                    title: "THE COLLEGIATE GRILL",
                    footer: "Thank You!",
                    show_date: true
                },
                abbreviations: { /* ...기존 약어 리스트... */ }
            }
        };
        fs.writeFileSync(dbPath, JSON.stringify(initialData, null, 4), 'utf-8');
    }
}

module.exports = { db, initDB };