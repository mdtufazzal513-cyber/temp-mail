const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Firebase Initialize (আপনার ডাউনলোড করা JSON ফাইলের নাম)
const serviceAccount = require('./firebase-key.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// ----------------------------------------------------
// API Failover Logic: 1secmail (Primary) -> Mail.tm (Secondary)
// ----------------------------------------------------

// Generate Email Route
app.get('/api/generate-email', async (req, res) => {
    try {
        // চেষ্টা ১: 1secmail API
        const response = await axios.get('https://www.1secmail.com/api/v1/?action=genRandomMailbox');
        const email = response.data[0];
        
        // Firebase এ লগ সেভ করা (Admin Panel এর জন্য)
        await db.collection('api_logs').add({ action: 'generate', provider: '1secmail', time: new Date(), status: 'success' });
        await db.collection('active_users').add({ email: email, createdAt: new Date() });

        return res.json({ success: true, email: email, provider: '1secmail' });

    } catch (error) {
        console.log("1secmail failed, switching to Mail.tm...");
        await db.collection('api_logs').add({ action: 'generate', provider: '1secmail', time: new Date(), status: 'failed' });

        // চেষ্টা ২: Mail.tm API (Failover)
        try {
            const domainRes = await axios.get('https://api.mail.tm/domains');
            const domain = domainRes.data['hydra:member'][0].domain;
            
            const randomName = Math.random().toString(36).substring(2, 10);
            const email = `${randomName}@${domain}`;
            const password = "Password123!"; // Stateless এর জন্য ফিক্সড বা জেনারেটেড পাসওয়ার্ড

            // Account Create
            await axios.post('https://api.mail.tm/accounts', { address: email, password: password });
            
            // Get Token
            const tokenRes = await axios.post('https://api.mail.tm/token', { address: email, password: password });
            const token = tokenRes.data.token;

            await db.collection('api_logs').add({ action: 'generate', provider: 'mail.tm', time: new Date(), status: 'success' });
            await db.collection('active_users').add({ email: email, createdAt: new Date() });

            return res.json({ success: true, email: email, provider: 'mail.tm', token: token });

        } catch (failoverError) {
            await db.collection('api_logs').add({ action: 'generate', provider: 'mail.tm', time: new Date(), status: 'failed' });
            return res.status(500).json({ success: false, message: "All APIs are currently down." });
        }
    }
});

// Get Messages Route (Stateless: ফ্রন্টএন্ড থেকে প্রোভাইডার ও ডাটা আসবে)
app.post('/api/get-messages', async (req, res) => {
    const { email, provider, token } = req.body;

    if (!email || !provider) return res.status(400).json({ error: "Missing data" });

    try {
        if (provider === '1secmail') {
            const [login, domain] = email.split('@');
            const response = await axios.get(`https://www.1secmail.com/api/v1/?action=getMessages&login=${login}&domain=${domain}`);
            return res.json({ success: true, messages: response.data });
        } 
        else if (provider === 'mail.tm') {
            const response = await axios.get('https://api.mail.tm/messages', {
                headers: { Authorization: `Bearer ${token}` }
            });
            // 1secmail এর ফরম্যাটে ডাটা ম্যাপ করা হচ্ছে
            const messages = response.data['hydra:member'].map(msg => ({
                id: msg.id,
                from: msg.from.address,
                subject: msg.subject,
                date: msg.createdAt
            }));
            return res.json({ success: true, messages: messages });
        }
    } catch (error) {
        return res.status(500).json({ success: false, error: "Failed to fetch messages" });
    }
});

// Admin Panel Stats Route
app.get('/api/admin/stats', async (req, res) => {
    const { secret } = req.query;
    if (secret !== process.env.ADMIN_SECRET_KEY) return res.status(401).json({ error: "Unauthorized" });

    const logsSnapshot = await db.collection('api_logs').orderBy('time', 'desc').limit(20).get();
    const logs = logsSnapshot.docs.map(doc => doc.data());

    res.json({ success: true, logs });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
