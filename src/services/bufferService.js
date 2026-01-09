// src/services/bufferService.js
const { db } = require('../config/db');

// 날짜 포맷 헬퍼
function formatCloverDate(dateObj) {
    const day = dateObj.getDate().toString().padStart(2, '0');
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${day}-${months[dateObj.getMonth()]}-${dateObj.getFullYear()}`;
}

// 약어 변환 헬퍼
async function getAbbreviatedMod(name) {
    if (!name) return '';
    try {
        const settings = await db.getData("/settings");
        const dict = settings.abbreviations || {};
        let modName = name.trim();
        const lowerName = modName.toLowerCase();
        
        if (dict[lowerName]) return dict[lowerName];
        
        let prefix = "";
        if (lowerName.startsWith("no ")) { prefix = "NO "; modName = modName.substring(3).trim(); }
        else if (lowerName.startsWith("add ")) { prefix = "ADD "; modName = modName.substring(4).trim(); }
        
        return prefix + modName.charAt(0).toUpperCase() + modName.slice(1);
    } catch { return name; }
}

// 주방 주문서 생성
async function generateKitchenBuffer(items, tableNumber, title) {
    const INIT = '\x1b\x40'; const RED = '\x1b\x34'; const BLACK = '\x1b\x35';
    const ALIGN_LEFT = '\x1b\x1d\x61\x00'; const ALIGN_CENTER = '\x1b\x1d\x61\x01'; const ALIGN_RIGHT = '\x1b\x1d\x61\x02';
    const BIG_FONT = '\x1b\x57\x01\x1b\x68\x01'; const CUT = '\x1b\x64\x02';

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
        
        const modifiers = item.selectedModifiers || item.options || item.modifiers || [];
        if (modifiers.length > 0) {
            buffer += ALIGN_RIGHT + RED;
            for (const mod of modifiers) {
                const modName = (typeof mod === 'string') ? mod : (mod.name || mod.label);
                buffer += `${await getAbbreviatedMod(modName)}\n`;
            }
            buffer += ALIGN_LEFT + BLACK;
        }
    }
    buffer += "----------------\n" + `ID: ${displayOrderNum}\n` + "\n\n\n" + CUT;
    return buffer;
}

// 영수증 생성 (기존 코드와 동일 로직)
async function generateReceiptBuffer(data) {
    const settings = await db.getData("/settings");
    const { items, tableNumber, subtotal, tax, tipAmount, totalAmount, date, orderType } = data;
    
    const displayOrderNum = (tableNumber && tableNumber !== 'To Go') ? tableNumber : "To Go";
    const displayType = (orderType === 'dine_in') ? "Dine In" : "To Go";

    const ESC = '\x1b'; const ALIGN_CENTER = '\x1b\x61\x01'; const ALIGN_LEFT = '\x1b\x61\x00'; const ALIGN_RIGHT = '\x1b\x61\x02'; 
    const BOLD_ON = '\x1b\x45\x01'; const BOLD_OFF = '\x1b\x45\x00'; 
    const DOUBLE_HEIGHT = '\x1b\x21\x10'; const NORMAL = '\x1b\x21\x00'; const CUT = '\x1d\x56\x42\x00';

    let buffer = ESC + '@' + ALIGN_CENTER + BOLD_ON + `${settings.design.title}\n` + BOLD_OFF + NORMAL + "Customer Receipt\n" + DOUBLE_HEIGHT + `[ ${displayType} ]\n` + NORMAL + `Date: ${date}\n--------------------------------\n`;
    buffer += ALIGN_LEFT + DOUBLE_HEIGHT + BOLD_ON + (displayOrderNum === "To Go" ? "Order Type: To Go\n" : `Order #: ${displayOrderNum}\n`) + NORMAL + BOLD_OFF + "--------------------------------\n";

    items.forEach(item => {
        const qty = item.quantity || 1;
        buffer += BOLD_ON + `${qty} ${item.name}` + BOLD_OFF + "\n";
        
        const modifiers = item.selectedModifiers || item.options || item.modifiers || [];
        if (modifiers.length > 0) {
            modifiers.forEach(mod => {
                const modName = (typeof mod === 'string') ? mod : (mod.name || mod.label);
                buffer += `   + ${modName} ($${(mod.price || 0).toFixed(2)})\n`;
            });
        }
        buffer += ALIGN_RIGHT + `$${(item.totalPrice || 0).toFixed(2)}\n` + ALIGN_LEFT;
    });

    buffer += "--------------------------------\n" + ALIGN_RIGHT + `Subtotal: $${(subtotal || 0).toFixed(2)}\nTax: $${(tax || 0).toFixed(2)}\n`;
    if (tipAmount > 0) buffer += BOLD_ON + `Tip: $${tipAmount.toFixed(2)}\n` + BOLD_OFF;
    buffer += "--------------------------------\n" + DOUBLE_HEIGHT + BOLD_ON + `TOTAL: $${(totalAmount || 0).toFixed(2)}\n` + NORMAL + BOLD_OFF;
    buffer += ALIGN_CENTER + `\n\n${settings.design.footer}\n\n\n\n\n` + CUT;
    
    return buffer;
}

module.exports = { generateKitchenBuffer, generateReceiptBuffer };