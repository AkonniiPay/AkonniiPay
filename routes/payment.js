const express = require('express');
const router = express.Router();
const PaymentLink = require('../models/PaymentLink');
const authMiddleware = require('../middleware/auth');

// POST /api/payment/create-link
router.post('/create-link', authMiddleware, async (req, res) => {
  try {
    const { title, amount, currency, feeBearer, expiryDate, expiresAt } = req.body;

    // 1. Title Validation
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: "Payment title is required." });
    }

    const numAmount = parseFloat(amount);
    // Currency parsing handles cases like "NGN (Naira - Paystack/Flutterwave)"
    const rawCurr = currency || 'NGN';
    const curr = rawCurr.includes('NGN') ? 'NGN' : rawCurr.substring(0, 3).toUpperCase();

    // 2. Strict validation: Min ₦200 for NGN, $1 for USD/others
    if (curr === 'NGN' && (!numAmount || numAmount < 200)) {
      return res.status(400).json({ success: false, message: "Minimum amount for Naira (NGN) is ₦200." });
    }
    if (curr !== 'NGN' && (!numAmount || numAmount < 1)) {
      return res.status(400).json({ success: false, message: "Minimum amount for foreign currency is $1." });
    }

    // Extract User ID safely from auth middleware
    const userId = req.user.id || req.user._id;

    // 3. Create and Save Link Model
    const newLink = new PaymentLink({
      user: userId,
      title: title.trim(),
      amount: numAmount,
      currency: curr,
      feeBearer: feeBearer || 'payer',
      expiryDate: expiryDate || expiresAt || null,
      status: 'Active'
    });

    await newLink.save();

    // Construct short checkout URL
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const checkoutUrl = `${baseUrl}/checkout.html?id=${newLink._id}`;

    return res.json({
      success: true,
      message: "Payment link created successfully!",
      link: {
        ...newLink.toObject(),
        shortUrl: checkoutUrl
      }
    });
  } catch (err) {
    console.error("Create payment link error:", err);
    return res.status(500).json({ success: false, message: err.message || "Error creating payment link." });
  }
});

// GET /api/payment/my-links
router.get('/my-links', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const links = await PaymentLink.find({ user: userId }).sort({ createdAt: -1 });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const formattedLinks = links.map(link => ({
      ...link.toObject(),
      shortUrl: `${baseUrl}/checkout.html?id=${link._id}`
    }));

    return res.json({ success: true, links: formattedLinks });
  } catch (err) {
    console.error("Fetch links error:", err);
    return res.status(500).json({ success: false, message: "Error fetching payment links." });
  }
});

module.exports = router;