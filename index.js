const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');

dotenv.config();

const app = express();

// Middleware to parse JSON request body
app.use(express.json());

// Serve static frontend files from 'public' folder
app.use(express.static('public'));

// -------------------------------------------------------------
// Security: Rate Limiting
// -------------------------------------------------------------
// General API Rate Limiter (100 requests per 15 minutes)
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { message: 'Too many requests from this IP, please try again after 15 minutes.' }
});

// Strict Public Checkout Rate Limiter (10 payment attempts per 15 minutes per IP)
const checkoutLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { message: 'Too many payment attempts from this IP, please try again later.' }
});

app.use('/api/', generalLimiter);
app.use('/api/payment/checkout/:slug/pay', checkoutLimiter);

// Connect to MongoDB Atlas
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('📦 Connected to MongoDB Atlas successfully!'))
    .catch((err) => console.error('❌ MongoDB Connection Error:', err));

// Routes Configuration
app.use('/api/auth', require('./routes/auth'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/payment', require('./routes/payment'));
app.use('/api/kyc', require('./routes/kyc'));

// Base Route
app.get('/', (req, res) => {
    res.send('AkonniiPay API is up and running safely!');
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server is running live on port ${PORT}`);
});