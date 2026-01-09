// src/controllers/printController.js
const { db } = require('../config/db');
const { sendToNetworkPrinter, openCashDrawer } = require('../services/networkService');
const { generateKitchenBuffer, generateReceiptBuffer } = require('../services/bufferService');

exports.printOrder = async (req, res) => {
    try {
        const settings = await db.getData("/settings");
        const { items, totalAmount, tableNumber } = req.body;
        console.log(`🖨️ [주문] Table: ${tableNumber}`);

        const milkshakeItems = [];
        const kitchenItems = [];
        
        if (items) {
            items.forEach(item => {
                const fullName = (item.name + " " + (item.pos_name || "")).toLowerCase();
                if (fullName.includes('milkshake') || fullName.includes('shake')) milkshakeItems.push(item);
                else kitchenItems.push(item);
            });
        }

        const promises = [];
        // 1. 주방 (음식)
        if (kitchenItems.length > 0) {
            const buffer = await generateKitchenBuffer(kitchenItems, tableNumber, "KITCHEN");
            promises.push(sendToNetworkPrinter(settings.printers.kitchen1_ip, buffer, "Kitchen 1"));
        }
        // 2. 주방 (쉐이크)
        if (milkshakeItems.length > 0) {
            const buffer = await generateKitchenBuffer(milkshakeItems, tableNumber, "MILKSHAKE");
            promises.push(sendToNetworkPrinter(settings.printers.kitchen2_ip, buffer, "Kitchen 2"));
        }
        // 3. 영수증
        if (totalAmount > 0) {
            const buffer = await generateReceiptBuffer(req.body);
            promises.push(sendToNetworkPrinter(settings.printers.receipt_ip, buffer, "Receipt"));
        }

        await Promise.all(promises);
        res.json({ success: true });
    } catch (e) {
        console.error("Print Error:", e);
        res.status(500).json({ error: e.message });
    }
};

exports.openDrawer = async (req, res) => {
    const { printerIp } = req.body;
    if (!printerIp) return res.status(400).json({ success: false, message: 'IP Required' });
    
    try {
        await openCashDrawer(printerIp);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: e.message }); }
};