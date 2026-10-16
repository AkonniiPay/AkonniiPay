const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const jwt = require('jsonwebtoken');

// Middleware to protect admin routes
const verifyAdmin = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Unauthorized: No token provided' });
  }

  try {
    // Uses dedicated ADMIN_JWT_SECRET
    const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'super_secret_jwt_key');
    if (!decoded.isAdmin) {
      return res.status(403).json({ success: false, message: 'Forbidden: Admin access only' });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired session' });
  }
};

// 1. Admin Login Endpoint
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
    // Signs token using ADMIN_JWT_SECRET
    const token = jwt.sign(
      { email, isAdmin: true },
      process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'super_secret_jwt_key',
      { expiresIn: '24h' }
    );
    return res.json({ success: true, token, message: 'Admin authenticated successfully' });
  }

  return res.status(401).json({ success: false, message: 'Invalid Admin credentials' });
});

// 2. Dashboard Statistics & User Balances Overview
router.get('/stats', verifyAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const users = await User.find({}, 'name fullName email balances walletBalance createdAt');
    const recentTransactions = await Transaction.find().sort({ createdAt: -1 }).limit(20);

    let totalBalances = { NGN: 0, USD: 0, GBP: 0, EUR: 0 };
    users.forEach(u => {
      const b = u.balances || u.walletBalance || {};
      totalBalances.NGN += b.NGN || 0;
      totalBalances.USD += b.USD || 0;
      totalBalances.GBP += b.GBP || 0;
      totalBalances.EUR += b.EUR || 0;
    });

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalBalances,
        userList: users,
        recentTransactions
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 3. Pending Withdrawals Queue
router.get('/withdrawals', verifyAdmin, async (req, res) => {
  try {
    const pendingWithdrawals = await Transaction.find({ type: 'withdrawal', status: 'pending' }).populate('user', 'name email');
    res.json({ success: true, withdrawals: pendingWithdrawals });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 4. Approve or Reject Withdrawal
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
      return res.json({ success: true, message: 'Withdrawal request approved and marked completed' });
    } 
    
    if (action === 'reject') {
      tx.status = 'rejected';
      tx.failureReason = reason || 'Rejected by Admin';
      await tx.save();

      // Refund balance to user wallet
      const user = await User.findById(tx.user);
      if (user) {
        const balKey = user.balances ? 'balances' : 'walletBalance';
        if (user[balKey]) {
          user[balKey][tx.currency] = (user[balKey][tx.currency] || 0) + tx.amount;
          await user.save();
        }
      }
      return res.json({ success: true, message: 'Withdrawal rejected and balance refunded to user' });
    }

    res.status(400).json({ success: false, message: 'Invalid action specified' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;