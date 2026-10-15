const express = require('express');
const router = express.Router();
const PaymentLink = require('../models/PaymentLink');
const authMiddleware = require('../middleware/auth');

// POST /api/payment/create-link
router.post('/create-link', authMiddleware, async (req, res) => {
  try {
    const { title, amount, currency, feeBearer, expiryDate } = req.body;

    const numAmount = parseFloat(amount);
    const curr = currency || 'NGN';

    // Strict validation: Min ₦200 for NGN, $1 for USD
    if (curr === 'NGN' && (!numAmount || numAmount < 200)) {
      return res.status(400).json({ success: false, message: "Minimum amount for Naira (NGN) is ₦200." });
    }
    if (curr !== 'NGN' && (!numAmount || numAmount < 1)) {
      return res.status(400).json({ success: false, message: "Minimum amount for foreign currency is $1." });
    }

    const newLink = new PaymentLink({
      user: req.user.id,
      title: title.trim(),
      amount: numAmount,
      currency: curr,
      feeBearer: feeBearer || 'payer',
      expiryDate: expiryDate || null,
      status: 'Active'
    });

    await newLink.save();

    return res.json({
      success: true,
      message: "Payment link created successfully!",
      link: newLink
    });
  } catch (err) {
    console.error("Create payment link error:", err);
    return res.status(500).json({ success: false, message: "Error creating payment link." });
  }
});

// GET /api/payment/my-links
router.get('/my-links', authMiddleware, async (req, res) => {
  try {
    const links = await PaymentLink.find({ user: req.user.id }).sort({ createdAt: -1 });
    return res.json({ success: true, links });
  } catch (err) {
    console.error("Fetch links error:", err);
    return res.status(500).json({ success: false, message: "Error fetching payment links." });
  }
});

module.exports = router;