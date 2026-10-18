const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const mongoose = require('mongoose');
const axios = require('axios');
const PaymentLink = require('../models/PaymentLink');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

function slugify(text) {
  return text.toString().toLowerCase().trim().replace(/[\s\W-]+/g, '-').replace(/^-+|-+$/g, '');
}

// Fair Checkout Fee Calculation
function calculateCheckoutFee(amount, currency) {
  const base = parseFloat(amount) || 0;
  if (base <= 0) return 0;

  const curr = (currency || 'NGN').toUpperCase();
  if (curr === 'NGN') {
    const fee = (base * 0.015) + 10;
    return Math.min(fee, 2000); 
  }
  return base * 0.029;
}

// POST /api/payment/create-link
router.post('/create-link', authMiddleware, async (req, res) => {
  try {
    const { title, amount, currency, feeBearer, expiryDate, expiresAt } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: "Payment title is required." });
    }

    const numAmount = parseFloat(amount);
    const curr = currency ? (currency.includes('NGN') ? 'NGN' : currency.substring(0, 3).toUpperCase()) : 'NGN';

    if (curr === 'NGN' && (!numAmount || numAmount < 200)) {
      return res.status(400).json({ success: false, message: "Minimum amount for Naira (NGN) is ₦200." });
    }
    if (curr !== 'NGN' && (!numAmount || numAmount < 1)) {
      return res.status(400).json({ success: false, message: "Minimum amount for foreign currency is $1." });
    }

    const userId = req.user.id || req.user._id;
    const reference = 'AKP_' + crypto.randomBytes(6).toString('hex').toUpperCase();
    const uniqueSlug = `${slugify(title)}-${crypto.randomBytes(3).toString('hex')}`;
    const finalExpiresAt = (expiryDate || expiresAt) ? new Date(expiryDate || expiresAt) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const linkId = new mongoose.Types.ObjectId();
    const baseUrl = `https://akonniipay.top`;
    const publicCheckoutUrl = `${baseUrl}/pay/${uniqueSlug}`;

    const newLink = new PaymentLink({
      _id: linkId,
      userId: userId,
      user: userId,
      title: title.trim(),
      amount: numAmount,
      currency: curr,
      chargeBearer: feeBearer || 'merchant',
      feeBearer: feeBearer || 'payer',
      expiresAt: finalExpiresAt,
      reference: reference,
      slug: uniqueSlug,
      url: publicCheckoutUrl,
      shortUrl: publicCheckoutUrl,
      status: 'Active'
    });

    await newLink.save();

    return res.json({
      success: true,
      message: "Payment link created successfully!",
      link: {
        ...newLink.toObject(),
        shortUrl: publicCheckoutUrl
      }
    });
  } catch (err) {
    console.error("Create payment link error:", err);
    return res.status(500).json({ success: false, message: err.message || "Error creating payment link." });
  }
});

// GET /api/payment/my-links
router.get('/my-links', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const links = await PaymentLink.find({ 
      $or: [{ userId: userId }, { user: userId }] 
    }).sort({ createdAt: -1 });

    const baseUrl = `https://akonniipay.top`;
    const formattedLinks = links.map(link => {
      const obj = link.toObject();
      const slugPath = obj.slug ? `/pay/${obj.slug}` : `/checkout.html?id=${obj._id}`;
      const generatedUrl = obj.url && obj.url.includes('/pay/') ? obj.url : `${baseUrl}${slugPath}`;
      return {
        ...obj,
        shortUrl: generatedUrl,
        url: generatedUrl,
        userId: obj.userId || obj.user,
        user: obj.user || obj.userId
      };
    });

    return res.json({ success: true, links: formattedLinks, data: formattedLinks });
  } catch (err) {
    console.error("Fetch links error:", err);
    return res.status(500).json({ success: false, message: "Error fetching payment links." });
  }
});

// GET /api/payment/link-by-slug/:slug (Public endpoint for clients)
router.get('/link-by-slug/:slug', async (req, res) => {
  try {
    const link = await PaymentLink.findOne({ slug: req.params.slug });
    
    if (!link || link.status !== 'Active') {
      return res.status(404).json({ success: false, message: "This payment link is invalid, expired, or has been closed." });
    }

    const fee = calculateCheckoutFee(link.amount, link.currency);
    const totalDue = link.feeBearer === 'payer' ? link.amount + fee : link.amount;

    const linkObj = link.toObject();
    linkObj.calculatedFee = fee;
    linkObj.totalDue = totalDue;

    return res.json({ success: true, link: linkObj });
  } catch (err) {
    console.error("Error fetching link by slug:", err);
    return res.status(500).json({ success: false, message: "Server error fetching payment link." });
  }
});

// POST /api/payment/initialize (Server-to-Server Initialization: Unified Paystack Engine for NGN and USD)
router.post('/initialize', async (req, res) => {
  try {
    const { linkId, slug, email, name, amount } = req.body;

    const query = slug ? { slug } : { _id: linkId };
    const link = await PaymentLink.findOne(query);

    if (!link || link.status !== 'Active') {
      return res.status(404).json({ success: false, message: "Payment link not found or inactive." });
    }

    const currency = (link.currency || 'NGN').toUpperCase();
    
    const callbackUrl = slug 
      ? `https://akonniipay.top/pay/${slug}?status=success&linkId=${link._id}`
      : `https://akonniipay.top/checkout.html?id=${link._id}&status=success`;

    const finalChargeAmount = Number(amount || link.amount);
    const secretKey = process.env.PAYSTACK_SECRET_KEY;

    if (!secretKey) {
      return res.status(500).json({ success: false, message: "Paystack secret key is not configured on server." });
    }

    // 1. NGN TRANSACTIONS (Paystack in Kobo)
    if (currency === 'NGN') {
      const amountInKobo = Math.round(finalChargeAmount * 100);
      const paystackRes = await axios.post('https://api.paystack.co/transaction/initialize', {
        email: email || "customer@akonniipay.top",
        amount: amountInKobo,
        currency: 'NGN',
        callback_url: callbackUrl,
        metadata: {
          linkId: link._id.toString(),
          clientName: name,
          originalCurrency: 'NGN'
        }
      }, {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (paystackRes.data && paystackRes.data.status) {
        return res.json({
          success: true,
          authorization_url: paystackRes.data.data.authorization_url,
          reference: paystackRes.data.data.reference
        });
      }
    } 
    
    // 2. USD & FOREIGN CURRENCIES (Paystack in Cents / Native USD without Naira conversion)
    else {
      let targetCurrency = currency === 'GBP' || currency === 'EUR' ? 'USD' : currency;
      if (targetCurrency !== 'USD') {
        targetCurrency = 'USD';
      }

      // Paystack expects amount in minor currency units (cents -> multiply by 100)
      const amountInCents = Math.round(finalChargeAmount * 100);

      const paystackForeignRes = await axios.post('https://api.paystack.co/transaction/initialize', {
        email: email || "customer@akonniipay.top",
        amount: amountInCents,
        currency: 'USD',
        callback_url: callbackUrl,
        metadata: {
          linkId: link._id.toString(),
          clientName: name,
          originalCurrency: targetCurrency
        }
      }, {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (paystackForeignRes.data && paystackForeignRes.data.status) {
        return res.json({
          success: true,
          authorization_url: paystackForeignRes.data.data.authorization_url,
          reference: paystackForeignRes.data.data.reference
        });
      }
    }

    return res.status(400).json({ success: false, message: "Could not initialize payment gateway." });
  } catch (err) {
    console.error("Payment initialize error:", err.response?.data || err.message);
    return res.status(500).json({ success: false, message: "Error connecting to payment gateway." });
  }
});

// POST /api/payment/webhook (Automated background listener for Paystack)
router.post('/webhook', async (req, res) => {
  try {
    const event = req.body;
    let linkId = null;
    let currency = 'NGN';
    let reference = null;

    if (event && event.event === 'charge.success') {
      const data = event.data;
      linkId = data.metadata?.linkId;
      currency = data.metadata?.originalCurrency || data.currency || 'NGN';
      reference = data.reference;
    }

    if (linkId) {
      const link = await PaymentLink.findById(linkId);
      if (link) {
        const merchantId = link.userId || link.user;
        const merchant = await User.findById(merchantId);

        if (merchant) {
          const merchantCreditAmount = Number(link.amount);

          if (!merchant.balances) {
            merchant.balances = { NGN: 0, USD: 0, GBP: 0, EUR: 0 };
          }
          if (!merchant.syncedReferences) {
            merchant.syncedReferences = [];
          }
          if (!merchant.transactionHistory) {
            merchant.transactionHistory = [];
          }

          if (reference && !merchant.syncedReferences.includes(reference)) {
            merchant.balances[currency] = (merchant.balances[currency] || 0) + merchantCreditAmount;
            merchant.syncedReferences.push(reference);
            merchant.transactionHistory.push({
              reference: reference,
              amount: merchantCreditAmount,
              currency: currency,
              status: 'credited',
              date: new Date()
            });
            await merchant.save();
            console.log(`[WEBHOOK] Credited base amount ${currency} ${merchantCreditAmount} to merchant ${merchant._id}`);
          }
        }
      }
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).json({ success: false, message: "Webhook server error." });
  }
});

// POST /api/payment/verify-and-credit (Auto-credits merchant balance on successful checkout return)
router.post('/verify-and-credit', async (req, res) => {
  try {
    const { currency, linkId, reference } = req.body;

    const link = await PaymentLink.findById(linkId);
    if (!link) {
      return res.status(404).json({ success: false, message: "Payment link not found." });
    }

    const merchantId = link.userId || link.user;
    const merchant = await User.findById(merchantId);

    if (!merchant) {
      return res.status(404).json({ success: false, message: "Merchant not found." });
    }

    const curr = currency || link.currency || 'NGN';
    const creditAmount = Number(link.amount);

    if (!merchant.balances) {
      merchant.balances = { NGN: 0, USD: 0, GBP: 0, EUR: 0 };
    }
    if (!merchant.syncedReferences) {
      merchant.syncedReferences = [];
    }
    if (!merchant.transactionHistory) {
      merchant.transactionHistory = [];
    }

    if (reference && merchant.syncedReferences.includes(reference)) {
      return res.json({ success: true, message: "Already added to balance", balances: merchant.balances });
    }

    merchant.balances[curr] = (merchant.balances[curr] || 0) + creditAmount;
    if (reference) {
      merchant.syncedReferences.push(reference);
      merchant.transactionHistory.push({
        reference: reference,
        amount: creditAmount,
        currency: curr,
        status: 'credited',
        date: new Date()
      });
    }
    await merchant.save();

    return res.json({
      success: true,
      message: `Successfully credited base amount ${curr} ${creditAmount} to merchant balance.`,
      balances: merchant.balances
    });
  } catch (err) {
    console.error("Verify and credit error:", err);
    return res.status(500).json({ success: false, message: "Server error updating balance." });
  }
});

// POST /api/payment/sync-payment (Strict reference validation & duplicate prevention)
router.post('/sync-payment', authMiddleware, async (req, res) => {
  try {
    const { reference } = req.body;

    if (!reference || !reference.trim()) {
      return res.status(400).json({ success: false, message: "Please provide a valid transaction reference code." });
    }

    const ref = reference.trim();
    const userId = req.user.id || req.user._id;
    const merchant = await User.findById(userId);

    if (!merchant) {
      return res.status(404).json({ success: false, message: "Merchant not found." });
    }

    if (!merchant.syncedReferences) {
      merchant.syncedReferences = [];
    }
    if (!merchant.transactionHistory) {
      merchant.transactionHistory = [];
    }

    const isAlreadyPaid = merchant.syncedReferences.includes(ref) || 
                          merchant.transactionHistory.some(tx => tx.reference === ref && tx.status === 'credited');

    if (isAlreadyPaid) {
      return res.status(400).json({ 
        success: false, 
        alreadyPaid: true,
        message: "Already added to balance" 
      });
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      return res.status(500).json({ success: false, message: "Paystack secret key is missing." });
    }

    let verifyRes;
    try {
      verifyRes = await axios.get(`https://api.paystack.co/transaction/verify/${encodeURIComponent(ref)}`, {
        headers: { Authorization: `Bearer ${secretKey}` }
      });
    } catch (apiErr) {
      return res.status(400).json({ 
        success: false, 
        message: "Error: Transaction reference code not found in records or invalid." 
      });
    }

    if (verifyRes.data && verifyRes.data.status && verifyRes.data.data.status === 'success') {
      const txData = verifyRes.data.data;
      const linkId = txData.metadata?.linkId;

      let creditAmount = txData.amount ? txData.amount / 100 : 0;
      let currency = (txData.metadata?.originalCurrency || txData.currency || 'NGN').toUpperCase();

      if (linkId) {
        const link = await PaymentLink.findById(linkId);
        if (link) {
          creditAmount = Number(link.amount);
          currency = (link.currency || 'NGN').toUpperCase();
        }
      }

      if (creditAmount <= 0) {
        return res.status(400).json({ success: false, message: "Invalid transaction amount recorded." });
      }

      if (!merchant.balances) {
        merchant.balances = { NGN: 0, USD: 0, GBP: 0, EUR: 0 };
      }

      merchant.balances[currency] = (merchant.balances[currency] || 0) + creditAmount;
      merchant.syncedReferences.push(ref);
      merchant.transactionHistory.push({
        reference: ref,
        amount: creditAmount,
        currency: currency,
        status: 'credited',
        date: new Date()
      });

      await merchant.save();

      return res.json({
        success: true,
        message: `Transaction verified! ${currency} ${creditAmount} successfully added to your balance.`,
        balances: merchant.balances
      });
    } else {
      return res.status(400).json({ 
        success: false, 
        message: "Error: Payment was not successful or reference is unverified." 
      });
    }
  } catch (err) {
    console.error("Sync payment error:", err.response?.data || err.message);
    return res.status(400).json({ success: false, message: "Invalid transaction reference or verification failed." });
  }
});

module.exports = router;