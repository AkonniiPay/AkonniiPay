const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');

// POST /api/kyc/verify
router.post('/verify', auth, async (req, res) => {
    try {
        const { bvn, nin } = req.body;

        if (!bvn && !nin) {
            return res.status(400).json({ message: 'Please provide either your BVN or NIN.' });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (bvn) user.bvn = bvn;
        if (nin) user.nin = nin;

        user.isKycVerified = true;
        user.tier = 'Tier 2';
        await user.save();

        res.json({ 
            message: 'Identity verified successfully! You are now on Tier 2.', 
            tier: user.tier,
            isKycVerified: user.isKycVerified 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;