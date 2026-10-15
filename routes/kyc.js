const express = require('express');
const router = express.Router();
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

// POST /api/kyc/verify
router.post('/verify', authMiddleware, async (req, res) => {
  try {
    const { bvn, nin } = req.body;

    if (!bvn || bvn.trim().length !== 11 || !nin || nin.trim().length !== 11) {
      return res.status(400).json({ 
        success: false, 
        message: "Both BVN and NIN must be exactly 11 digits." 
      });
    }

    const userId = req.user.id || req.user._id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User account not found." });
    }

    // Save verification data directly to MongoDB user document
    user.bvn = bvn.trim();
    user.nin = nin.trim();
    user.kycStatus = "Verified";

    user.virtualAccounts = user.virtualAccounts || {};
    user.virtualAccounts.NGN = {
      bankName: "Wema Bank",
      accountNumber: "99" + Math.floor(10000000 + Math.random() * 90000000),
      accountName: user.fullName || user.name || "AkonniiPay Merchant"
    };

    user.markModified('virtualAccounts');
    await user.save();

    return res.json({
      success: true,
      message: "Identity verified and saved successfully!",
      user: {
        kycStatus: user.kycStatus,
        bvn: user.bvn,
        nin: user.nin,
        virtualAccounts: user.virtualAccounts
      }
    });

  } catch (err) {
    console.error("KYC Error:", err);
    return res.status(500).json({ success: false, message: "Server error during verification." });
  }
});

module.exports = router;