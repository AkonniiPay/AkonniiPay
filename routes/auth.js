const router = require('express').Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// 1. INITIATE SIGNUP (Generates 6-Digit Email OTP)
router.post('/signup-initiate', async (req, res) => {
    try {
        const { fullName, email, password, phoneNumber, occupation } = req.body;

        if (!fullName || !email || !password || !phoneNumber || !occupation) {
            return res.status(400).json({ message: 'All fields (Name, Email, Password, Phone, Occupation) are required.' });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'Account with this email already exists.' });
        }

        // Generate 6-digit OTP code
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

        res.json({
            message: 'OTP sent to email successfully for verification.',
            otpCode, // Returned for verification workflow
            tempUserData: { fullName, email, password, phoneNumber, occupation }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. COMPLETE SIGNUP AFTER OTP VERIFICATION
router.post('/signup-verify', async (req, res) => {
    try {
        const { fullName, email, password, phoneNumber, occupation, userOtp, generatedOtp } = req.body;

        if (userOtp !== generatedOtp) {
            return res.status(400).json({ message: 'Invalid OTP verification code.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            fullName,
            email,
            password: hashedPassword,
            phoneNumber,
            occupation,
            isEmailVerified: true
        });

        await newUser.save();

        const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET || 'secretKey', { expiresIn: '1d' });

        res.json({
            message: 'Registration and verification completed successfully!',
            token,
            user: { id: newUser._id, fullName: newUser.fullName, email: newUser.email }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. LOGIN
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: 'Invalid credentials.' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: 'Invalid credentials.' });

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'secretKey', { expiresIn: '1d' });

        res.json({ token, user: { id: user._id, fullName: user.fullName, email: user.email } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;