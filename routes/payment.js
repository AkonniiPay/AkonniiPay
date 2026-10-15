const express = require('express');
const router = express.Router();
const crypto = require('crypto');
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
    const rawCurr = currency || 'NGN';
    const curr = rawCurr.includes('NGN') ? 'NGN' : rawCurr.substring(0, 3).toUpperCase();

    // 2. Strict amount validation
    if (curr === 'NGN' && (!numAmount || numAmount < 200)) {
      return res.status(400).json({ success: false, message: "Minimum amount for Naira (NGN) is ₦200." });
    }
    if (curr !== 'NGN' && (!numAmount || numAmount < 1)) {
      return res.status(400).json({ success: false, message: "Minimum amount for foreign currency is $1." });
    }

    const userId = req.user.id || req.user._id;

    // 3. Generate unique reference and default expiration (30 days if not picked)
    const reference = 'AKP_' + crypto.randomBytes(6).toString('hex').toUpperCase();
    const finalExpiresAt = (expiryDate || expiresAt) 
      ? new Date(expiryDate || expiresAt) 
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // 4. Pre-generate document ID to build the exact URL required by schema
    const mongoose = require('mongoose');
    const linkId = new mongoose.Types.ObjectId();
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const checkoutUrl = `${baseUrl}/checkout.html?id=${linkId}`;

    // 5. Construct PaymentLink satisfying all required schema fields
    const newLink = new PaymentLink({
      _id: linkId,
      user: userId,
      userId: userId,
      title: title.trim(),
      amount: numAmount,
      currency: curr,
      feeBearer: feeBearer || 'payer',
      expiresAt: finalExpiresAt,
      expiryDate: finalExpiresAt,
      reference: reference,
      url: checkoutUrl,
      shortUrl: checkoutUrl,
      status: 'Active'
    });

    await newLink.save();

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
    const links = await PaymentLink.find({ 
      $or: [{ userId: userId }, { user: userId }] 
    }).sort({ createdAt: -1 });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const formattedLinks = links.map(link => {
      const obj = link.toObject();
      const generatedUrl = obj.url || obj.shortUrl || `${baseUrl}/checkout.html?id=${obj._id}`;
      return {
        ...obj,
        shortUrl: generatedUrl
      };
    });

    return res.json({ success: true, links: formattedLinks });
  } catch (err) {
    console.error("Fetch links error:", err);
    return res.status(500).json({ success: false, message: "Error fetching payment links." });
  }
});

module.exports = router;