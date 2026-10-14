const router = require('express').Router();
const User = require('../models/User');
const auth = require('../middleware/auth');

// INSTANT KYC VERIFICATION WITH DOCUMENT / PROFILE MATCHING
router.post('/submit', auth, async (req, res) => {
    try {
        const { bvn, nin, fullName, address } = req.body;

        if (!bvn || bvn.length !== 11 || !nin || nin.length !== 11) {
            return res.status(400).json({ message: 'Valid 11-digit BVN and NIN are required.' });
        }

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found.' });

        // Match provided verification details with registered user profile
        const profileName = (user.fullName || '').trim().toLowerCase();
        const inputName = (fullName || '').trim().toLowerCase();

        if (profileName && inputName && profileName !== inputName) {
            return res.status(400).json({ 
                message: 'Verification failed: Name on verification documents does not match account legal name.' 
            });
        }

        user.bvn = bvn;
        user.nin = nin;
        user.kycStatus = 'Verified'; // Instant verification upon successful data match
        user.verifiedAt = new Date();
        await user.save();

        res.json({
            message: 'Account verified successfully! You now have full access to higher transaction limits.',
            kycStatus: user.kycStatus
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET KYC STATUS
router.get('/status', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('kycStatus verifiedAt');
        res.json({ kycStatus: user.kycStatus || 'Pending Verification' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;