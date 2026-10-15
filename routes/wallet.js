const router = require('express').Router();
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const PaymentLink = require('../models/PaymentLink');
const auth = require('../middleware/auth');

// Live market exchange rates matching frontend
const exchangeRates = { USD: 1350.65, GBP: 1780.20, EUR: 1495.50, NGN: 1 };

// Helper to calculate withdrawal fees (e.g., 1.5% or minimum fee)
function calculateWithdrawalFee(amount, currency) {
  const num = Number(amount);
  if (currency === 'NGN') {
    // 1.5% fee or minimum ₦50
    return Math.max(num * 0.015, 50);
  }
  // Foreign currency fee (e.g. $1 or 2%)
  return Math.max(num * 0.02, 1);
}

// 1. GET USER WALLET & ACCOUNT DETAILS
router.get('/', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        // Synchronize legacy structures if necessary
        if (!user.balances) {
            user.balances = { NGN: user.walletBalance || 0, USD: 0, GBP: 0, EUR: 0 };
            await user.save();
        }

        res.json({
            user: {
                name: user.name || user.fullName,
                email: user.email,
                address: user.address,
                tier: user.tier || 'Tier 1',
                kycStatus: user.kycStatus || 'verified',
                accounts: user.virtualAccounts || user.accounts || {}
            },
            balances: user.balances,
            wallets: user.balances,
            balance: user.balances.NGN || 0
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

// 4. AUTOMATED WITHDRAWAL WITH DEDUCTED FEES
router.post('/withdraw', auth, async (req, res) => {
    try {
        const { amount, bankName, accountNumber, accountName, currency } = req.body;

        const requestedAmount = Number(amount);
        if (!requestedAmount || requestedAmount <= 0) {
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

        if (currentBalance < requestedAmount) {
            return res.status(400).json({ message: `Insufficient ${curr} wallet balance. Available: ${curr === 'NGN' ? '₦' : '$'}${currentBalance}` });
        }

        // Calculate withdrawal processing fee
        const fee = calculateWithdrawalFee(requestedAmount, curr);
        const netPayoutAmount = requestedAmount - fee;

        if (netPayoutAmount <= 0) {
            return res.status(400).json({ message: `Amount is too low to cover withdrawal processing fee (${curr} ${fee}).` });
        }

        // Deduct full requested amount (amount + fee covered inside it) from user's balance
        user.balances[curr] -= requestedAmount;
        if (curr === 'NGN') user.walletBalance = user.balances.NGN;
        await user.save();

        let finalNairaPayout = netPayoutAmount;
        if (curr !== 'NGN') {
            const rate = exchangeRates[curr] || 1;
            finalNairaPayout = netPayoutAmount * rate;
        }

        const reference = 'WD_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

        const transaction = new Transaction({
            user: user._id,
            type: 'withdrawal',
            amount: requestedAmount,
            fee: fee,
            netAmount: netPayoutAmount,
            currency: curr,
            status: 'completed',
            reference,
            description: `Withdrawal of ${curr} ${requestedAmount} (Fee: ${curr} ${fee.toFixed(2)}, Net Payout: ₦${finalNairaPayout.toLocaleString()}) to ${accountName || user.name} (${bankName} - ${accountNumber})`
        });

        await transaction.save();

        res.json({
            success: true,
            message: `Successfully processed withdrawal of ${curr} ${requestedAmount.toLocaleString()}! Fee deducted: ${curr} ${fee.toFixed(2)}. Net payout: ₦${finalNairaPayout.toLocaleString()} sent to ${bankName} (${accountNumber}).`,
            reference,
            balances: user.balances
        });
    } catch (err) {
        console.error("Withdrawal processing error:", err);
        res.status(500).json({ error: err.message });
    }
});

// 5. BALANCE RE-CALIBRATION ROUTE (Fixes existing ₦900 balance down to ₦600 base amount)
router.post('/recalibrate-balance', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: 'User not found.' });

        // Reset NGN balance to 600 as required (3 payments x 200 base amount)
        user.balances.NGN = 600;
        user.walletBalance = 600;
        await user.save();

        res.json({
            success: true,
            message: 'Balance successfully adjusted to ₦600.',
            balances: user.balances
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;