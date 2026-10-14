const router = require('express').Router();
const User = require('../models/User');
const auth = require('../middleware/auth');

// GET USER PROFILE & SETTINGS
router.get('/profile', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }
        res.json({ user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// UPDATE PROFILE (Name, Address)
router.put('/profile', auth, async (req, res) => {
    try {
        const { name, address } = req.body;
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        if (name) user.name = name;
        if (address) user.address = address;

        await user.save();

        res.json({
            message: 'Profile updated successfully!',
            user: {
                name: user.name,
                email: user.email,
                address: user.address,
                kycStatus: user.kycStatus
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;