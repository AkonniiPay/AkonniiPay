const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const PaymentLink = require('../models/PaymentLink');

// 1. POST /api/webhook/paystack
router.post('/paystack', async (req, res) => {
    try {
        const secretKey = process.env.PAYSTACK_SECRET_KEY;
        if (!secretKey) {
            console.error('[WEBHOOK] Missing PAYSTACK_SECRET_KEY');
            return res.status(500).send('Configuration error');
        }

        const hash = crypto.createHmac('sha512', secretKey).update(JSON.stringify(req.body)).digest('hex');

        if (hash !== req.headers['x-paystack-signature']) {
            console.error('[WEBHOOK] Signature mismatch');
            return res.status(400).send('Invalid signature');
        }

        const event = req.body;

        if (event.event === 'charge.success') {
            const data = event.data;
            const reference = data.reference;
            const amountPaid = data.amount / 100;
            const currency = (data.currency || 'NGN').toUpperCase();
            const metadata = data.metadata || {};
            const customerEmail = data.customer ? data.customer.email : null;

            const existingTx = await Transaction.findOne({ reference });
            if (existingTx) return res.status(200).send('Event already processed');

            let merchant = null;
            if (metadata.merchantId) {
                merchant = await User.findById(metadata.merchantId);
            } else if (customerEmail) {
                merchant = await User.findOne({ email: customerEmail.toLowerCase().trim() });
            }

            if (merchant) {
                const netAmount = amountPaid * 0.96; // 4% fee

                merchant.balances = merchant.balances || { NGN: 0, USD: 0, GBP: 0 };
                merchant.balances[currency] = (merchant.balances[currency] || 0) + netAmount;
                merchant.walletBalance = (merchant.walletBalance || 0) + netAmount;

                await merchant.save();

                if (metadata.linkId) {
                    try {
                        await PaymentLink.findByIdAndUpdate(metadata.linkId, { $inc: { paidCount: 1 } });
                    } catch (linkErr) {
                        console.warn('[WEBHOOK] Link update notice:', linkErr.message);
                    }
                }

                const transaction = new Transaction({
                    user: merchant._id,
                    type: 'deposit',
                    amount: netAmount,
                    currency: currency,
                    status: 'completed',
                    reference: reference,
                    description: `Paystack Deposit: ${currency} ${amountPaid}`
                });
                await transaction.save();

                console.log(`[PAYSTACK DEPOSIT] Credited ${netAmount} ${currency} to ${merchant.email}`);
            }
        }

        res.sendStatus(200);
    } catch (err) {
        console.error('Paystack Webhook error:', err.message || err);
        res.status(500).send('Server error');
    }
});

// 2. POST /api/webhook/flutterwave
router.post('/flutterwave', async (req, res) => {
    try {
        const signature = req.headers['verif-hash'];
        const secretHash = process.env.FLUTTERWAVE_SECRET_HASH || "fe33731418a0832bebf091f789cd695a";

        if (!signature || signature !== secretHash) {
            console.error('[FLW WEBHOOK] Signature mismatch');
            return res.status(401).send('Unauthorized webhook signature');
        }

        const payload = req.body;

        if (payload.event === 'charge.completed' && payload.data && payload.data.status === 'successful') {
            const data = payload.data;
            const reference = data.tx_ref || `FLW_${data.id}`;
            const amountPaid = data.amount;
            const currency = (data.currency || 'NGN').toUpperCase();
            const customerEmail = data.customer ? data.customer.email : null;

            const existingTx = await Transaction.findOne({ reference });
            if (existingTx) return res.status(200).send('Event already processed');

            if (customerEmail) {
                const merchant = await User.findOne({ email: customerEmail.toLowerCase().trim() });

                if (merchant) {
                    const netAmount = amountPaid * 0.96;

                    merchant.balances = merchant.balances || { NGN: 0, USD: 0, GBP: 0 };
                    merchant.balances[currency] = (merchant.balances[currency] || 0) + netAmount;
                    merchant.walletBalance = (merchant.walletBalance || 0) + netAmount;

                    await merchant.save();

                    const transaction = new Transaction({
                        user: merchant._id,
                        type: 'deposit',
                        amount: netAmount,
                        currency: currency,
                        status: 'completed',
                        reference: reference,
                        description: `Flutterwave Bank Transfer: ${currency} ${amountPaid}`
                    });
                    await transaction.save();

                    console.log(`[FLUTTERWAVE DEPOSIT] Credited ${netAmount} ${currency} to ${merchant.email}`);
                }
            }
        }

        res.status(200).send("Webhook Processed");
    } catch (err) {
        console.error("Flutterwave Webhook Error:", err.message || err);
        res.status(500).send("Server Error");
    }
});

module.exports = router;