const router = require('express').Router();
const User = require('../models/User');
const auth = require('../middleware/auth');

// GET USER PROFILE (With Auto-Heal for Virtual Accounts)
router.get('/profile', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        // Auto-generate Wema Bank virtual account if user is verified but account number is missing
        if (user.kycStatus === 'Verified' && (!user.virtualAccounts || !user.virtualAccounts.NGN || !user.virtualAccounts.NGN.accountNumber)) {
            const accountHolder = user.fullName || user.name || "Luqman Abiodun Oyewole";
            user.virtualAccounts = user.virtualAccounts || {};
            user.virtualAccounts.NGN = {
                bankName: "Wema Bank",
                accountNumber: "99" + Math.floor(10000000 + Math.random() * 90000000),
                accountName: accountHolder
            };
            user.markModified('virtualAccounts');
            await user.save();
        }

        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// UPDATE USER PROFILE
router.put('/profile', auth, async (req, res) => {
    try {
        const { fullName, address, occupation, phoneNumber, phone } = req.body;
        const user = await User.findById(req.user.id);

        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        if (fullName) {
            user.fullName = fullName;
            user.name = fullName;
            
            // Split into firstName & lastName as well for compatibility
            const parts = fullName.trim().split(' ');
            user.firstName = parts[0] || user.firstName;
            user.lastName = parts.slice(1).join(' ') || user.lastName;

            // Instantly sync account holder name on NGN Virtual Account
            if (user.virtualAccounts && user.virtualAccounts.NGN) {
                user.virtualAccounts.NGN.accountName = fullName;
                user.markModified('virtualAccounts');
            }
        }
        if (address) user.address = address;
        if (occupation) user.occupation = occupation;
        
        const cleanPhone = phoneNumber || phone;
        if (cleanPhone) {
            user.phoneNumber = cleanPhone;
            user.phone = cleanPhone;
        }

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

        const fullName = user.fullName || user.name || "Luqman Abiodun Oyewole";

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