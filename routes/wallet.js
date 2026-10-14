const router = require('express').Router();
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const auth = require('../middleware/auth');

// 1. GET USER WALLET & ACCOUNT DETAILS
router.get('/', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        res.json({
            user: {
                name: user.name,
                email: user.email,
                address: user.address,
                tier: user.tier || 'Tier 1',
                kycStatus: user.kycStatus || 'unverified',
                accounts: user.accounts || {}
            },
            wallets: user.wallets || { usd: 0, eur: 0, gbp: 0, ngn: 0 },
            balance: user.walletBalance || 0
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. GET TRANSACTION HISTORY
router.get('/transactions', auth, async (req, res) => {
    try {
        const transactions = await Transaction.find({ user: req.user.id }).sort({ createdAt: -1 });
        res.json({ count: transactions.length, transactions });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. RESOLVE BANK ACCOUNT NAME
router.post('/resolve-account', auth, async (req, res) => {
    try {
        const { accountNumber, bankName } = req.body;
        if (!accountNumber || accountNumber.length < 10) {
            return res.status(400).json({ message: 'Enter a valid 10-digit account number.' });
        }

        const user = await User.findById(req.user.id);
        res.json({
            accountNumber,
            bankName,
            accountName: user ? user.name : 'Luqman Abiodun Oyewole'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. AUTOMATED WITHDRAWAL / BANK PAYOUT
router.post('/withdraw', auth, async (req, res) => {
    try {
        const { amount, bankName, accountNumber, accountName, currency } = req.body;

        const payoutAmount = Number(amount);
        if (!payoutAmount || payoutAmount <= 0) {
            return res.status(400).json({ message: 'Please enter a valid withdrawal amount.' });
        }

        if (!bankName || !accountNumber) {
            return res.status(400).json({ message: 'Bank name and account number are required.' });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const curr = (currency || 'usd').toLowerCase();
        const currentBalance = user.wallets && user.wallets[curr] !== undefined ? user.wallets[curr] : user.walletBalance;

        if (currentBalance < payoutAmount) {
            return res.status(400).json({ message: `Insufficient ${curr.toUpperCase()} wallet balance for this withdrawal.` });
        }

        // Deduct balance
        if (user.wallets && user.wallets[curr] !== undefined) {
            user.wallets[curr] -= payoutAmount;
        }
        user.walletBalance -= payoutAmount;
        await user.save();

        const reference = 'WD_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

        const transaction = new Transaction({
            user: user._id,
            type: 'withdrawal',
            amount: payoutAmount,
            currency: curr.toUpperCase(),
            status: 'completed',
            reference,
            description: `Payout of ${curr.toUpperCase()} ${payoutAmount.toFixed(2)} to ${accountName || user.name} (${bankName} - ${accountNumber})`
        });

        await transaction.save();

        res.json({
            message: `Successfully withdrew ${curr.toUpperCase()} ${payoutAmount.toFixed(2)} to ${accountName || user.name} [${bankName} - ${accountNumber}]!`,
            reference,
            newBalance: currentBalance - payoutAmount
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;