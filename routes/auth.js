const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// POST /api/auth/register (or /api/user/register)
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, address, phone, occupation } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please enter all required fields.' });
    }

    let user = await User.findOne({ email: email.toLowerCase().trim() });
    if (user) {
      return res.status(400).json({ success: false, message: 'An account with this email already exists.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    user = new User({
      name,
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      address,
      phone,
      occupation,
      kycStatus: 'Pending Verification',
      balances: { NGN: 0, USD: 0, GBP: 0 }
    });

    await user.save();

    const payload = { id: user._id, email: user.email };
    const token = jwt.sign(payload, process.env.JWT_SECRET || 'secretkey', { expiresIn: '7d' });

    return res.status(201).json({
      success: true,
      token,
      message: 'Account created successfully!',
      user: { id: user._id, name: user.name, email: user.email, kycStatus: user.kycStatus }
    });

  } catch (err) {
    console.error('Registration Route Error:', err);
    return res.status(500).json({ success: false, message: 'Server error during registration.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid credentials.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Invalid credentials.' });
    }

    const payload = { id: user._id, email: user.email };
    const token = jwt.sign(payload, process.env.JWT_SECRET || 'secretkey', { expiresIn: '7d' });

    return res.json({
      success: true,
      token,
      message: 'Logged in successfully!',
      user: { id: user._id, name: user.name, email: user.email, kycStatus: user.kycStatus }
    });

  } catch (err) {
    console.error('Login Route Error:', err);
    return res.status(500).json({ success: false, message: 'Server error during login.' });
  }
});

module.exports = router;