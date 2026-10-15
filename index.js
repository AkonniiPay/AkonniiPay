const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const PaymentLink = require('./models/PaymentLink');

dotenv.config();

const app = express();

// 1. TRUST PROXY (Required for Render + express-rate-limit)
app.set('trust proxy', 1);

// 2. MIDDLEWARE
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// 3. DATABASE CONNECTION
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/akonniipay';

mongoose.connect(MONGO_URI)
    .then(() => console.log('📦 Connected to MongoDB Atlas successfully!'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err.message));

// 4. API ROUTES
app.use('/api/auth', require('./routes/auth'));
app.use('/api/kyc', require('./routes/kyc'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/payment', require('./routes/payment'));
app.use('/api/webhook', require('./routes/webhook'));
app.use('/api/user', require('./routes/user'));

// 5. EXPLICIT PAGE ROUTES (Express v5 Safe)

// Public Payment Link Slug Resolver
app.get('/pay/:slug', async (req, res) => {
    try {
        const link = await PaymentLink.findOne({ slug: req.params.slug });
        
        if (!link || link.status !== 'Active') {
            return res.status(404).send("This payment link is invalid, expired, or has been closed.");
        }

        res.sendFile(path.join(__dirname, 'public', 'checkout.html'));
    } catch (err) {
        console.error("Public pay route error:", err);
        res.status(500).send("Server error loading checkout.");
    }
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/generate-link', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'generate-link.html'));
});

app.get('/transactions', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'transactions.html'));
});

app.get('/verification', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'verification.html'));
});

app.get('/settings', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

app.get('/checkout', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'checkout.html'));
});

// Root fallback
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 6. PORT BINDING FOR RENDER
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server is running live on port ${PORT}`);
});