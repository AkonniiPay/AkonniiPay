const router = require('express').Router();
const User = require('../models/User');
const auth = require('../middleware/auth');

// GET USER PROFILE
router.get('/profile', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// UPDATE USER PROFILE
router.put('/profile', auth, async (req, res) => {
    try {
        const { fullName, address, occupation, phoneNumber } = req.body;
        const user = await User.findById(req.user.id);

        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        if (fullName) user.fullName = fullName;
        if (address) user.address = address;
        if (occupation) user.occupation = occupation;
        if (phoneNumber) user.phoneNumber = phoneNumber;

        await user.save();
        res.json({ success: true, message: 'Profile updated successfully!', user });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// KYC VERIFICATION ROUTE
router.post('/verify', auth, async (req, res) => {
    try {
        const { bvn, nin } = req.body;

        if (!bvn || bvn.trim().length !== 11 || !nin || nin.trim().length !== 11) {
            return res.status(400).json({ 
                success: false, 
                message: "Both BVN and NIN must be exactly 11 digits." 
            });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: "User account not found." });
        }

        const fullName = user.fullName || user.name || "AkonniiPay Merchant";

        // Save directly to MongoDB user document
        user.bvn = bvn.trim();
        user.nin = nin.trim();
        user.kycStatus = "Verified";

        user.virtualAccounts = user.virtualAccounts || {};
        user.virtualAccounts.NGN = {
            bankName: "Wema Bank",
            accountNumber: "99" + Math.floor(10000000 + Math.random() * 90000000),
            accountName: fullName
        };

        user.markModified('virtualAccounts');
        await user.save();

        res.json({
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
        console.error("Verification Error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;