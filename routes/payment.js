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

// -------------------------------------------------------------
// 1. AUTHENTICATED USER: Create Multi-Currency Payment Link
// -------------------------------------------------------------
router.post(
    '/create-link',
    auth,
    [
        body('title').notEmpty().withMessage('Title is required.').trim().escape(),
        body('currency').optional().isIn(['USD', 'EUR', 'GBP', 'NGN']).withMessage('Currency must be USD, EUR, GBP, or NGN.'),
        body('amount').optional().isNumeric().withMessage('Amount must be a number.')
    ],
    handleValidationErrors,
    async (req, res) => {
        try {
            const { title, amount, currency, description, allowCustomAmount } = req.body;

            if (!allowCustomAmount && (!amount || Number(amount) <= 0)) {
                return res.status(400).json({ message: 'Title and a valid positive amount are required unless custom amount is allowed.' });
            }

            const slug = title.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now();

            const newLink = new PaymentLink({
                merchant: req.user.id,
                title,
                amount: allowCustomAmount ? (amount || 0) : Number(amount),
                currency: currency ? currency.toUpperCase() : 'USD',
                description: description || '',
                slug
            });

            await newLink.save();

            const baseUrl = req.protocol + '://' + req.get('host');

            res.status(201).json({
                message: 'Payment link created successfully!',
                id: newLink._id,
                linkId: newLink._id,
                slug: newLink.slug,
                paymentUrl: `${baseUrl}/checkout.html?id=${newLink._id}`,
                linkDetails: newLink,
                paymentLink: newLink
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
);

// -------------------------------------------------------------
// 2. PUBLIC / GUEST: View Payment Link Details
// -------------------------------------------------------------
router.get('/checkout/:slug', async (req, res) => {
    try {
        const paymentLink = await PaymentLink.findOne({ 
            $or: [{ slug: req.params.slug }, { _id: req.params.slug }] 
        }).populate('merchant', 'name email');

        if (!paymentLink || !paymentLink.isActive) {
            return res.status(404).json({ message: 'Payment link not found or inactive.' });
        }

        res.json({
            id: paymentLink._id,
            title: paymentLink.title,
            amount: paymentLink.amount,
            currency: paymentLink.currency,
            description: paymentLink.description,
            recipientName: paymentLink.merchant ? paymentLink.merchant.name : 'Merchant',
            slug: paymentLink.slug,
            supportedMethods: ['card', 'paypal', 'wise', 'bank_wire']
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// -------------------------------------------------------------
// 3. PUBLIC / GUEST: Checkout Payment with Multi-Currency Support
// -------------------------------------------------------------
router.post(
    '/checkout/:slug/pay',
    [
        body('paymentMethod')
            .notEmpty().withMessage('Payment method is required.')
            .isIn(['card', 'paypal', 'wise', 'bank_wire']).withMessage('Invalid payment method. Valid choices: card, paypal, wise, bank_wire.'),
        body('guestEmail').optional().isEmail().withMessage('Please provide a valid email address.').normalizeEmail(),
        body('customAmount').optional().isFloat({ gt: 0 }).withMessage('Custom amount must be greater than 0.'),
        body('guestName').optional().trim().escape()
    ],
    handleValidationErrors,
    async (req, res) => {
        try {
            const { paymentMethod, guestEmail, guestName, customAmount } = req.body;
            const selectedMethod = paymentMethod.toLowerCase();

            const paymentLink = await PaymentLink.findOne({ 
                $or: [{ slug: req.params.slug }, { _id: req.params.slug }] 
            });
            if (!paymentLink || !paymentLink.isActive) {
                return res.status(404).json({ message: 'Payment link not found or inactive.' });
            }

            const merchant = await User.findById(paymentLink.merchant);
            if (!merchant) {
                return res.status(404).json({ message: 'Recipient account not found.' });
            }

            const finalAmount = customAmount && Number(customAmount) > 0 ? Number(customAmount) : paymentLink.amount;
            const currency = paymentLink.currency || 'USD';

            if (finalAmount <= 0) {
                return res.status(400).json({ message: 'Please provide a valid payment amount.' });
            }

            const reference = 'PAY_' + selectedMethod.toUpperCase() + '_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

            // Credit merchant wallet balance directly
            merchant.walletBalance = (merchant.walletBalance || 0) + finalAmount;
            await merchant.save();

            // Record completed transaction
            const transaction = new Transaction({
                user: merchant._id,
                type: 'deposit',
                amount: finalAmount,
                currency,
                status: 'completed',
                reference,
                description: `Payment received in ${currency} via ${selectedMethod.toUpperCase()} from ${guestName || guestEmail || 'Guest Client'}`
            });

            await transaction.save();

            res.json({
                message: `Payment of ${currency} ${finalAmount} processed successfully via ${selectedMethod.toUpperCase()}!`,
                receipt: {
                    reference,
                    amountPaid: finalAmount,
                    currency,
                    paymentMethod: selectedMethod.toUpperCase(),
                    recipient: merchant.name,
                    paidBy: guestName || guestEmail || 'Guest Client',
                    date: new Date()
                }
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
);

module.exports = router;