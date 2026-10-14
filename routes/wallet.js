const router = require('express').Router();
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const auth = require('../middleware/auth');

// 0. GET WALLET & USER PROFILE (Fixes the login/dashboard redirect loop)
router.get('/', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                tier: user.tier || 'Tier 1',
                isEmailVerified: user.isEmailVerified || false,
                isKycVerified: user.isKycVerified || false
            },
            balance: user.walletBalance || 0
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 1. DEPOSIT: Manual Top-Up
router.post('/deposit', auth, async (req, res) => {
    try {
        const { amount } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ message: 'Please enter a valid deposit amount.' });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const reference = 'AKP_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

        user.walletBalance = (user.walletBalance || 0) + Number(amount);
        await user.save();

        const transaction = new Transaction({
            user: user._id,
            type: 'deposit',
            amount: Number(amount),
            status: 'completed',
            reference,
            description: 'Wallet top-up'
        });

        await transaction.save();

        res.json({
            message: 'Deposit successful!',
            newBalance: user.walletBalance,
            transaction
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. WITHDRAWAL / PAYOUT (Enforces Tier check for security)
router.post('/withdraw', auth, async (req, res) => {
    try {
        const { amount, bankName, accountNumber, accountName } = req.body;

        if (!amount || Number(amount) <= 0) {
            return res.status(400).json({ message: 'Please enter a valid withdrawal amount.' });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if user is KYC verified for payouts
        if (!user.isKycVerified) {
            return res.status(403).json({ message: 'Please complete your BVN/NIN verification (KYC) before making bank withdrawals.' });
        }

        if ((user.walletBalance || 0) < Number(amount)) {
            return res.status(400).json({ 
                message: `Insufficient balance. Available balance: $${user.walletBalance || 0}` 
            });
        }

        const reference = 'WTH_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

        user.walletBalance -= Number(amount);
        await user.save();

        const transaction = new Transaction({
            user: user._id,
            type: 'withdrawal',
            amount: Number(amount),
            status: 'completed',
            reference,
            description: `Payout to ${bankName || 'Bank'} (${accountNumber || 'N/A'}) - ${accountName || user.name}`
        });

        await transaction.save();

        res.json({
            message: 'Payout processed successfully!',
            remainingBalance: user.walletBalance,
            payoutDetails: {
                reference,
                amountWithdrawn: Number(amount),
                destination: { bankName, accountNumber, accountName },
                date: new Date()
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. TRANSACTIONS HISTORY
router.get('/transactions', auth, async (req, res) => {
    try {
        const transactions = await Transaction.find({ user: req.user.id }).sort({ createdAt: -1 });
        res.json({
            count: transactions.length,
            transactions
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;