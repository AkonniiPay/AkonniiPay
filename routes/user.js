const router = require('express').Router();
const User = require('../models/User');
const auth = require('../middleware/auth');

// GET USER PROFILE
router.get('/profile', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// UPDATE USER PROFILE
router.put('/profile', auth, async (req, res) => {
    try {
        const { fullName, address, occupation, phoneNumber } = req.body;
        const user = await User.findById(req.user.id);

        if (!user) return res.status(404).json({ message: 'User not found' });

        if (fullName) user.fullName = fullName;
        if (address) user.address = address;
        if (occupation) user.occupation = occupation;
        if (phoneNumber) user.phoneNumber = phoneNumber;

        await user.save();
        res.json({ message: 'Profile updated successfully!', user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;