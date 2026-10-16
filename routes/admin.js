const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const PaymentLink = require('../models/PaymentLink');
const jwt = require('jsonwebtoken');

// Middleware to protect admin routes
const verifyAdmin = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Unauthorized: No token provided' });
  }

  try {
    const decoded = jwt.verify(
      token, 
      process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'super_secret_jwt_key'
    );
    if (!decoded.isAdmin) {
      return res.status(403).json({ success: false, message: 'Forbidden: Admin access only' });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired session' });
  }
};

// 1. Admin Login
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
    const token = jwt.sign(
      { email, isAdmin: true },
      process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'super_secret_jwt_key',
      { expiresIn: '24h' }
    );
    return res.json({ success: true, token, message: 'Admin authenticated successfully' });
  }

  return res.status(401).json({ success: false, message: 'Invalid Admin credentials' });
});

// 2. Comprehensive Admin Stats & Verification Metrics
router.get('/stats', verifyAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const users = await User.find({}, 'name fullName email balances walletBalance status kycStatus createdAt updatedAt').lean();
    const recentTransactions = await Transaction.find().populate('user', 'fullName email').sort({ createdAt: -1 }).limit(15).lean();

    let totalBalances = { NGN: 0, USD: 0, GBP: 0, EUR: 0 };
    let kycMetrics = { verified: 0, pending: 0, unverified: 0 };

    users.forEach(u => {
      const b = u.balances || u.walletBalance || {};
      totalBalances.NGN += b.NGN || 0;
      totalBalances.USD += b.USD || 0;
      totalBalances.GBP += b.GBP || 0;
      totalBalances.EUR += b.EUR || 0;

      // Track KYC Verification states
      const kyc = (u.kycStatus || 'Unverified').toLowerCase();
      if (kyc === 'verified' || kyc === 'approved') kycMetrics.verified++;
      else if (kyc === 'pending' || kyc === 'submitted' || kyc === 'in_review') kycMetrics.pending++;
      else kycMetrics.unverified++;
    });

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalBalances,
        kycMetrics,
        userList: users,
        recentTransactions
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 3. User Deep-Dive (View Activity, Payment Links, Transactions)
router.get('/users/:userId/activity', verifyAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const paymentLinks = await PaymentLink.find({ user: userId }).sort({ createdAt: -1 }).lean();
    const transactions = await Transaction.find({ user: userId }).sort({ createdAt: -1 }).lean();

    res.json({
      success: true,
      user,
      activity: {
        totalLinksCreated: paymentLinks.length,
        totalTransactions: transactions.length,
        paymentLinks,
        transactions
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 4. Adjust User Balance
router.post('/users/adjust-balance', verifyAdmin, async (req, res) => {
  const { userId, currency, amount, type, note } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const balKey = user.balances ? 'balances' : 'walletBalance';
    if (!user[balKey]) user[balKey] = { NGN: 0, USD: 0, GBP: 0, EUR: 0 };

    const currentBal = user[balKey][currency] || 0;
    const numAmount = parseFloat(amount);

    if (type === 'subtract' && currentBal < numAmount) {
      return res.status(400).json({ success: false, message: 'Insufficient user balance for deduction' });
    }

    user[balKey][currency] = type === 'add' ? currentBal + numAmount : currentBal - numAmount;
    user.markModified(balKey);
    await user.save();

    await Transaction.create({
      user: userId,
      type: type === 'add' ? 'admin_credit' : 'admin_debit',
      amount: numAmount,
      currency: currency,
      status: 'completed',
      description: note || `Admin ${type === 'add' ? 'Credit' : 'Debit'}`
    });

    res.json({ success: true, message: `Successfully ${type === 'add' ? 'credited' : 'debited'} ${currency} ${numAmount}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 5. Toggle User Status
router.post('/users/toggle-status', verifyAdmin, async (req, res) => {
  const { userId, status } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.status = status;
    await user.save();

    res.json({ success: true, message: `User status changed to ${status}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 6. Get Pending Withdrawals
router.get('/withdrawals', verifyAdmin, async (req, res) => {
  try {
    const withdrawals = await Transaction.find({ type: 'withdrawal', status: 'pending' }).populate('user', 'fullName email').lean();
    res.json({ success: true, withdrawals });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 7. Process Withdrawal
router.post('/withdrawals/action', verifyAdmin, async (req, res) => {
  const { transactionId, action, reason } = req.body;

  try {
    const tx = await Transaction.findById(transactionId);
    if (!tx || tx.type !== 'withdrawal') {
      return res.status(404).json({ success: false, message: 'Withdrawal request not found' });
    }

    if (action === 'approve') {
      tx.status = 'completed';
      await tx.save();
      return res.json({ success: true, message: 'Withdrawal approved successfully' });
    }

    if (action === 'reject') {
      tx.status = 'rejected';
      tx.failureReason = reason || 'Rejected by Admin';
      await tx.save();

      const user = await User.findById(tx.user);
      if (user) {
        const balKey = user.balances ? 'balances' : 'walletBalance';
        if (user[balKey]) {
          user[balKey][tx.currency] = (user[balKey][tx.currency] || 0) + tx.amount;
          user.markModified(balKey);
          await user.save();
        }
      }
      return res.json({ success: true, message: 'Withdrawal rejected and funds refunded to user' });
    }

    res.status(400).json({ success: false, message: 'Invalid action' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;