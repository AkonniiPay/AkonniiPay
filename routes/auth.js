const router = require('express').Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');

// REGISTER
router.post(
    '/register',
    [
        body('name').notEmpty().withMessage('Name is required.'),
        body('email').isEmail().withMessage('Valid email is required.'),
        body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters.'),
        body('address').notEmpty().withMessage('Physical address is required.')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array().map(e => e.msg) });
            }

            const { name, email, password, address } = req.body;

            let user = await User.findOne({ email });
            if (user) {
                return res.status(400).json({ message: 'User already exists with this email.' });
            }

            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            user = new User({
                name,
                email,
                password: hashedPassword,
                address,
                tier: 'Tier 1',
                kycStatus: 'unverified',
                wallets: { usd: 0, eur: 0, gbp: 0, ngn: 0 }
            });

            await user.save();

            const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'akonniisecret', { expiresIn: '7d' });

            res.status(201).json({
                message: 'Account created successfully!',
                token,
                user: { id: user._id, name: user.name, email: user.email, address: user.address, kycStatus: user.kycStatus }
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
);

// LOGIN
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials.' });
        }

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'akonniisecret', { expiresIn: '7d' });

        res.json({
            message: 'Logged in successfully!',
            token,
            user: { id: user._id, name: user.name, email: user.email, address: user.address, kycStatus: user.kycStatus }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;