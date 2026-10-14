const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const PaymentLink = require('../models/PaymentLink');
const auth = require('../middleware/auth');

const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array().map(err => err.msg) });
    }
    next();
};

// 1. CREATE PAYMENT LINK (With Expiration Support)
router.post(
    '/create-link',
    auth,
    [
        body('title').notEmpty().withMessage('Title is required.').trim().escape(),
        body('amount').isNumeric().withMessage('Valid amount is required.')
    ],
    handleValidationErrors,
    async (req, res) => {
        try {
            const { title, amount, currency, description, expiresInDays } = req.body;

            if (!amount || Number(amount) <= 0) {
                return res.status(400).json({ message: 'Amount must be greater than 0.' });
            }

            const slug = title.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now();

            let expiresAt = null;
            if (expiresInDays && Number(expiresInDays) > 0) {
                expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + Number(expiresInDays));
            }

            const newLink = new PaymentLink({
                merchant: req.user.id,
                title,
                amount: Number(amount),
                currency: currency ? currency.toUpperCase() : 'USD',
                description: description || '',
                slug,
                expiresAt
            });

            await newLink.save();

            const baseUrl = req.protocol + '://' + req.get('host');

            res.status(201).json({
                message: 'Payment link created successfully!',
                id: newLink._id,
                linkId: newLink._id,
                slug: newLink.slug,
                paymentUrl: `${baseUrl}/checkout.html?id=${newLink._id}`,
                paymentLink: newLink
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
);

// 2. GET MERCHANT'S PAYMENT LINKS (For Dashboard Persistence & Tracking)
router.get('/my-links', auth, async (req, res) => {
    try {
        const links = await PaymentLink.find({ merchant: req.user.id }).sort({ createdAt: -1 });
        
        const now = new Date();
        const updatedLinks = links.map(link => {
            const isExpired = link.expiresAt && new Date(link.expiresAt) < now;
            return {
                ...link._doc,
                status: isExpired ? 'Expired' : (link.isActive ? 'Active' : 'Inactive')
            };
        });

        res.json({ count: updatedLinks.length, links: updatedLinks });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. PUBLIC: VIEW PAYMENT LINK DETAILS FOR CHECKOUT
router.get('/checkout/:identifier', async (req, res) => {
    try {
        const identifier = req.params.identifier;
        let paymentLink = null;

        if (identifier.match(/^[0-9a-fA-F]{24}$/)) {
            paymentLink = await PaymentLink.findById(identifier).populate('merchant', 'name email');
        } else {
            paymentLink = await PaymentLink.findOne({ slug: identifier }).populate('merchant', 'name email');
        }

        if (!paymentLink) {
            return res.status(404).json({ message: 'Payment link not found.' });
        }

        if (paymentLink.expiresAt && new Date(paymentLink.expiresAt) < new Date()) {
            return res.status(410).json({ message: 'This payment link has expired.' });
        }

        res.json({
            id: paymentLink._id,
            title: paymentLink.title,
            amount: paymentLink.amount,
            currency: paymentLink.currency || 'USD',
            description: paymentLink.description || '',
            recipientName: paymentLink.merchant ? paymentLink.merchant.name : 'Merchant',
            slug: paymentLink.slug,
            expiresAt: paymentLink.expiresAt
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. PUBLIC: EXECUTE GUEST PAYMENT
router.post('/checkout/:identifier/pay', async (req, res) => {
    try {
        const { paymentMethod, guestEmail, guestName } = req.body;
        const identifier = req.params.identifier;

        let paymentLink = null;
        if (identifier.match(/^[0-9a-fA-F]{24}$/)) {
            paymentLink = await PaymentLink.findById(identifier);
        } else {
            paymentLink = await PaymentLink.findOne({ slug: identifier });
        }

        if (!paymentLink || !paymentLink.isActive) {
            return res.status(404).json({ message: 'Payment link not found or inactive.' });
        }

        if (paymentLink.expiresAt && new Date(paymentLink.expiresAt) < new Date()) {
            return res.status(410).json({ message: 'This payment link has expired.' });
        }

        const merchant = await User.findById(paymentLink.merchant);
        if (!merchant) {
            return res.status(404).json({ message: 'Recipient account not found.' });
        }

        const reference = 'PAY_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

        merchant.walletBalance = (merchant.walletBalance || 0) + paymentLink.amount;
        await merchant.save();

        paymentLink.paidCount = (paymentLink.paidCount || 0) + 1;
        await paymentLink.save();

        const transaction = new Transaction({
            user: merchant._id,
            type: 'deposit',
            amount: paymentLink.amount,
            currency: paymentLink.currency || 'USD',
            status: 'completed',
            reference,
            description: `Payment for "${paymentLink.title}" from ${guestName || guestEmail || 'Guest Client'}`
        });

        await transaction.save();

        res.json({
            message: `Payment of ${paymentLink.currency || 'USD'} ${paymentLink.amount} successful!`,
            reference
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;