const router = require('express').Router();
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const auth = require('../middleware/auth');

// Live market exchange rates matching frontend
const exchangeRates = { USD: 1350.65, GBP: 1780.20, EUR: 1495.50, NGN: 1 };

// 1. GET USER WALLET & ACCOUNT DETAILS
router.get('/', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        res.json({
            user: {
                name: user.name || user.fullName,
                email: user.email,
                address: user.address,
                tier: user.tier || 'Tier 1',
                kycStatus: user.kycStatus || 'verified',
                accounts: user.accounts || {}
            },
            balances: user.balances || { NGN: 0, USD: 0, GBP: 0, EUR: 0 },
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
            accountName: user ? (user.name || user.fullName) : 'Luqman Abiodun Oyewole'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. AUTOMATED WITHDRAWAL / BANK PAYOUT (Supports NGN & Foreign Currencies with Live Conversion)
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

        const curr = (currency || 'NGN').toUpperCase();

        if (!user.balances) {
            user.balances = { NGN: 0, USD: 0, GBP: 0, EUR: 0 };
        }

        const currentBalance = user.balances[curr] || 0;

        if (currentBalance < payoutAmount) {
            return res.status(400).json({ message: `Insufficient ${curr} wallet balance for this withdrawal.` });
        }

        // Deduct balance from specific currency wallet
        user.balances[curr] -= payoutAmount;
        await user.save();

        let finalNairaPayout = payoutAmount;
        if (curr !== 'NGN') {
            const rate = exchangeRates[curr] || 1;
            finalNairaPayout = payoutAmount * rate;
        }

        const reference = 'WD_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

        const transaction = new Transaction({
            user: user._id,
            type: 'withdrawal',
            amount: payoutAmount,
            currency: curr,
            status: 'completed',
            reference,
            description: `Withdrawal of ${curr} ${payoutAmount.toFixed(2)} (Payout: ₦${finalNairaPayout.toLocaleString()}) to ${accountName || user.name} (${bankName} - ${accountNumber})`
        });

        await transaction.save();

        res.json({
            success: true,
            message: `Successfully withdrew ${curr} ${payoutAmount.toFixed(2)} (Equivalent ₦${finalNairaPayout.toLocaleString()}) to ${bankName} - ${accountNumber}!`,
            reference,
            balances: user.balances
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;