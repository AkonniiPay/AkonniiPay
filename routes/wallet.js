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
                tier: user.tier || 'Tier 1',
                isKycVerified: user.isKycVerified || false,
                accounts: user.accounts || {}
            },
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

// 3. RESOLVE BANK ACCOUNT NAME (Name Suggestion for Withdrawals)
router.post('/resolve-account', auth, async (req, res) => {
    try {
        const { accountNumber, bankName } = req.body;

        if (!accountNumber || accountNumber.length < 10) {
            return res.status(400).json({ message: 'Enter a valid 10-digit account number.' });
        }

        // Return user name or resolved bank holder name
        const user = await User.findById(req.user.id);
        const resolvedName = user ? user.name : 'Account Holder';

        res.json({
            accountNumber,
            bankName,
            accountName: resolvedName
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. AUTOMATED WITHDRAWAL / BANK PAYOUT
router.post('/withdraw', auth, async (req, res) => {
    try {
        const { amount, bankName, accountNumber, accountName } = req.body;

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

        if ((user.walletBalance || 0) < payoutAmount) {
            return res.status(400).json({ message: 'Insufficient wallet balance for this withdrawal.' });
        }

        // Deduct balance
        user.walletBalance -= payoutAmount;
        await user.save();

        const reference = 'WD_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

        const transaction = new Transaction({
            user: user._id,
            type: 'withdrawal',
            amount: payoutAmount,
            currency: 'USD',
            status: 'completed',
            reference,
            description: `Payout of $${payoutAmount.toFixed(2)} to ${accountName || user.name} - ${bankName} (${accountNumber})`
        });

        await transaction.save();

        res.json({
            message: `Successfully withdrew $${payoutAmount.toFixed(2)} to ${accountName || user.name} [${bankName} - ${accountNumber}]!`,
            reference,
            newBalance: user.walletBalance
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;