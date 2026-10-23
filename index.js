const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const { Resend } = require('resend');
const PaymentLink = require('./models/PaymentLink');

dotenv.config();

const app = express();

// Initialize Resend with API Key
const resend = new Resend(process.env.RESEND_API_KEY);

// 1. TRUST PROXY (Required for Render)
app.set('trust proxy', 1);

// 2. MIDDLEWARE & CORS CONFIGURATION
const allowedOrigins = [
  'https://akonniipay.top',
  'https://www.akonniipay.top',
  'https://akonniipay.onrender.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS policy'));
    }
  },
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// 3. DATABASE CONNECTION
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/akonniipay';

mongoose.connect(MONGO_URI)
    .then(() => console.log('📦 Connected to MongoDB Atlas successfully!'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err.message));

// 4. OTP IN-MEMORY STORAGE
const otpStorage = new Map();

// 5. CUSTOM PLATFORM OTP ENDPOINTS
app.post('/api/otp/send', async (req, res) => {
  try {
    const { email, actionType } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'User email is required' });
    }

    // Generate random 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP with 10-minute validity
    otpStorage.set(email.toLowerCase(), {
      code,
      actionType: actionType || 'SECURITY_VERIFICATION',
      expires: Date.now() + 10 * 60 * 1000
    });

    // Send email via Resend API (HTTP, bypasses port blocks)
    const { data, error } = await resend.emails.send({
      from: 'AkonniiPay <onboarding@resend.dev>',
      to: [email],
      subject: `Your AkonniiPay OTP Verification Code: ${code}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <h2 style="color: #0f172a; margin-bottom: 8px;">Security Verification</h2>
          <p style="color: #64748b; font-size: 14px;">You requested a verification code to authorize a <strong>${actionType || 'platform action'}</strong> on AkonniiPay.</p>
          <div style="text-align: center; margin: 24px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #2563eb; background: #f1f5f9; padding: 12px 24px; border-radius: 8px; display: inline-block;">${code}</span>
          </div>
          <p style="color: #64748b; font-size: 13px;">This code will expire in <strong>10 minutes</strong>. If you did not initiate this request, please secure your account immediately.</p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
          <small style="color: #94a3b8; font-size: 11px;">Akonnii Technologies LTD • AkonniiPay Financial Infrastructure</small>
        </div>
      `
    });

    if (error) {
      console.error('❌ Resend API Error:', error);
      return res.status(500).json({ success: false, message: 'Failed to dispatch email verification.' });
    }

    return res.json({ success: true, message: `Verification code sent to ${email}` });
  } catch (err) {
    console.error('❌ OTP Email Sending Error:', err);
    return res.status(500).json({ success: false, message: 'Failed to send verification code. Check email configuration.' });
  }
});

app.post('/api/otp/verify', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ success: false, message: 'Email and verification code are required' });
    }

    const record = otpStorage.get(email.toLowerCase());

    if (!record) {
      return res.status(400).json({ success: false, message: 'No active OTP request found or code has expired.' });
    }

    if (Date.now() > record.expires) {
      otpStorage.delete(email.toLowerCase());
      return res.status(400).json({ success: false, message: 'Verification code has expired. Please request a new one.' });
    }

    if (record.code !== code.trim()) {
      return res.status(400).json({ success: false, message: 'Invalid verification code. Please check and try again.' });
    }

    // Clear OTP after successful validation
    otpStorage.delete(email.toLowerCase());

    return res.json({ success: true, message: 'OTP verified successfully.' });
  } catch (err) {
    console.error('❌ OTP Verification Error:', err);
    return res.status(500).json({ success: false, message: 'Server error during verification.' });
  }
});

// 6. API ROUTES
app.use('/api/auth', require('./routes/auth'));
app.use('/api/kyc', require('./routes/kyc'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/payment', require('./routes/payment'));
app.use('/api/webhook', require('./routes/webhook'));
app.use('/api/user', require('./routes/user'));
app.use('/api/admin', require('./routes/admin'));

// 7. EXPLICIT PAGE ROUTES (Express v5 Safe)

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

// 8. PORT BINDING FOR RENDER
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server is running live on port ${PORT}`);
});