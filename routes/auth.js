const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, address, phone, occupation } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Check if user already exists
    let user = await User.findOne({ email: cleanEmail });
    if (user) {
      return res.status(400).json({ success: false, message: 'An account with this email already exists.' });
    }

    // Split Full Name into First and Last Name
    const cleanName = (name || 'Luqman Abiodun Oyewole').trim();
    const nameParts = cleanName.split(' ');
    const firstName = nameParts[0] || 'Merchant';
    const lastName = nameParts.slice(1).join(' ') || 'User';

    // Hash Password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Build User Object with EXACT Mongoose Schema Keys: fullName & phoneNumber
    user = new User({
      fullName: cleanName,
      name: cleanName,
      firstName: firstName,
      lastName: lastName,
      email: cleanEmail,
      password: hashedPassword,
      address: address || 'Not provided',
      phoneNumber: phone || '+2348080567034',
      phone: phone || '+2348080567034',
      occupation: occupation || 'Software Developer',
      kycStatus: 'Pending Verification',
      balances: { NGN: 0, USD: 0, GBP: 0 },
      virtualAccounts: {}
    });

    await user.save();

    // Sign JWT Token
    const payload = { id: user._id, email: user.email };
    const token = jwt.sign(payload, process.env.JWT_SECRET || 'secretkey', { expiresIn: '7d' });

    return res.status(201).json({
      success: true,
      token,
      message: 'Account created successfully!',
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        kycStatus: user.kycStatus
      }
    });

  } catch (err) {
    console.error('Registration Catch Error:', err.message || err);
    return res.status(500).json({ 
      success: false, 
      message: err.message ? `Registration failed: ${err.message}` : 'Server error during registration.' 
    });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please enter both email and password.' });
    }

    const cleanEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Invalid email or password.' });
    }

    const payload = { id: user._id, email: user.email };
    const token = jwt.sign(payload, process.env.JWT_SECRET || 'secretkey', { expiresIn: '7d' });

    return res.json({
      success: true,
      token,
      message: 'Logged in successfully!',
      user: {
        id: user._id,
        fullName: user.fullName || user.name,
        email: user.email,
        kycStatus: user.kycStatus
      }
    });

  } catch (err) {
    console.error('Login Catch Error:', err.message || err);
    return res.status(500).json({ success: false, message: 'Server error during login.' });
  }
});

module.exports = router;