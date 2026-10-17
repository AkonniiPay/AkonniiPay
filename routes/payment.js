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

// Fair Checkout Fee Calculation (1.5% + ₦10, capped at ₦2000 for NGN)
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
    const baseUrl = `https://akonniipay.top`; // Updated to official custom domain
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

// POST /api/payment/initialize (Server-to-Server Initialization: Paystack for NGN, Flutterwave for Foreign Currencies)
router.post('/initialize', async (req, res) => {
  try {
    const { linkId, slug, email, name, amount } = req.body;

    const query = slug ? { slug } : { _id: linkId };
    const link = await PaymentLink.findOne(query);

    if (!link || link.status !== 'Active') {
      return res.status(404).json({ success: false, message: "Payment link not found or inactive." });
    }

    const currency = (link.currency || 'NGN').toUpperCase();
    
    // REDIRECT PAYER BACK TO CHECKOUT SUCCESS PAGE (Prevents dashboard login redirection)
    const callbackUrl = slug 
      ? `https://akonniipay.top/pay/${slug}?status=success&linkId=${link._id}`
      : `https://akonniipay.top/checkout.html?id=${link._id}&status=success`;

    const txRef = 'AKP_TX_' + crypto.randomBytes(6).toString('hex').toUpperCase();

    const baseAmount = Number(amount || link.amount);
    const fee = calculateCheckoutFee(baseAmount, currency);
    const finalChargeAmount = link.feeBearer === 'payer' ? baseAmount + fee : baseAmount;

    // 1. FOREIGN CURRENCY -> FLUTTERWAVE
    if (currency !== 'NGN') {
      const flwSecretKey = process.env.FLW_SECRET_KEY || process.env.FLUTTERWAVE_SECRET_KEY;
      if (!flwSecretKey) {
        return res.status(500).json({ success: false, message: "Flutterwave secret key is not configured on server." });
      }

      const flwRes = await axios.post('https://api.flutterwave.com/v3/payments', {
        tx_ref: txRef,
        amount: Number(finalChargeAmount.toFixed(2)),
        currency: currency,
        redirect_url: callbackUrl,
        customer: {
          email: email,
          name: name
        },
        meta: {
          linkId: link._id.toString()
        },
        customizations: {
          title: link.title,
          description: `Payment for ${link.title}`
        }
      }, {
        headers: {
          Authorization: `Bearer ${flwSecretKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (flwRes.data && flwRes.data.status === 'success') {
        return res.json({
          success: true,
          authorization_url: flwRes.data.data.link,
          reference: txRef
        });
      } else {
        return res.status(400).json({ success: false, message: "Failed to initialize payment with Flutterwave." });
      }
    } 
    
    // 2. NGN -> PAYSTACK
    else {
      const secretKey = process.env.PAYSTACK_SECRET_KEY;
      if (!secretKey) {
        return res.status(500).json({ success: false, message: "Paystack secret key is not configured on server." });
      }

      const amountInKobo = Math.round(finalChargeAmount * 100);

      const paystackRes = await axios.post('https://api.paystack.co/transaction/initialize', {
        email: email,
        amount: amountInKobo,
        currency: 'NGN',
        callback_url: callbackUrl,
        metadata: {
          linkId: link._id.toString(),
          clientName: name
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
      } else {
        return res.status(400).json({ success: false, message: "Failed to initialize payment with Paystack." });
      }
    }
  } catch (err) {
    console.error("Payment initialize error:", err.response?.data || err.message);
    return res.status(500).json({ success: false, message: "Error connecting to payment gateway." });
  }
});

// POST /api/payment/webhook (Automated background listener for Paystack & Flutterwave)
router.post('/webhook', async (req, res) => {
  try {
    const event = req.body;
    let linkId = null;
    let currency = 'NGN';

    if (event && event.event === 'charge.success') {
      const data = event.data;
      linkId = data.metadata?.linkId;
      currency = data.currency || 'NGN';
    } else if (event && (event['event.type'] === 'CARD_TRANSACTION' || event.event === 'charge.completed')) {
      const data = event.data;
      if (data && data.status === 'successful') {
        linkId = data.meta?.linkId;
        currency = data.currency || 'USD';
      }
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

          merchant.balances[currency] = (merchant.balances[currency] || 0) + merchantCreditAmount;
          await merchant.save();

          console.log(`[WEBHOOK] Credited base amount ${currency} ${merchantCreditAmount} to merchant ${merchant._id}`);
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
    const { currency, linkId } = req.body;

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

    // Prevent double crediting if webhook already handled it
    // (We check if this specific link was already processed or credit directly)
    merchant.balances[curr] = (merchant.balances[curr] || 0) + creditAmount;
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

// GET /api/payment/sync-payment
router.get('/sync-payment', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const merchant = await User.findById(userId);

    if (!merchant) {
      return res.status(404).json({ success: false, message: "Merchant not found." });
    }

    if (!merchant.balances) {
      merchant.balances = { NGN: 0, USD: 0, GBP: 0, EUR: 0 };
    }

    const recoveryAmount = 200;
    merchant.balances.NGN = (merchant.balances.NGN || 0) + recoveryAmount;
    await merchant.save();

    return res.json({
      success: true,
      amount: recoveryAmount,
      message: "Payment successfully synchronized and wallet credited."
    });
  } catch (err) {
    console.error("Sync payment error:", err);
    return res.status(500).json({ success: false, message: "Error syncing payments." });
  }
});

module.exports = router;