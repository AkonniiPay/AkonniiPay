const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const PaymentLink = require('../models/PaymentLink');

// Live Paystack Secret Key
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || 'sk_live_1d3c781f7303cc735f53b5830f4f81544cef382e';

// POST /api/webhook/paystack
router.post('/paystack', async (req, res) => {
    try {
        // Verify Paystack HMAC SHA512 signature
        const hash = crypto.createHmac('sha512', PAYSTACK_SECRET_KEY).update(JSON.stringify(req.body)).digest('hex');

        if (hash !== req.headers['x-paystack-signature']) {
            console.error('[WEBHOOK] Signature mismatch');
            return res.status(400).send('Invalid signature');
        }

        const event = req.body;

        if (event.event === 'charge.success') {
            const data = event.data;
            const reference = data.reference;
            const amountPaid = data.amount / 100; // Convert kobo to Naira
            const currency = data.currency || 'NGN';
            const metadata = data.metadata || {};
            const customerEmail = data.customer ? data.customer.email : null;

            // Prevent duplicate processing
            const existingTx = await Transaction.findOne({ reference });
            if (existingTx) {
                return res.status(200).send('Event already processed');
            }

            let merchant = null;

            // Scenario A: Deposit via Payment Link
            if (metadata.merchantId) {
                merchant = await User.findById(metadata.merchantId);
            } 
            // Scenario B: Deposit via Dedicated Virtual Account (DVA)
            else if (customerEmail) {
                merchant = await User.findOne({ email: customerEmail.toLowerCase().trim() });
            }

            if (merchant) {
                // Deduct 4% platform processing fee for net balance credit
                const netAmount = amountPaid * 0.96;

                // 1. Update balances object
                merchant.balances = merchant.balances || { NGN: 0, USD: 0, GBP: 0 };
                const currKey = currency.toUpperCase();
                merchant.balances[currKey] = (merchant.balances[currKey] || 0) + netAmount;
                merchant.walletBalance = (merchant.walletBalance || 0) + netAmount;

                await merchant.save();

                // 2. Increment Payment Link paid counter if payment came from a link
                if (metadata.linkId) {
                    try {
                        await PaymentLink.findByIdAndUpdate(metadata.linkId, { $inc: { paidCount: 1 } });
                    } catch (linkErr) {
                        console.warn('[WEBHOOK] Payment link update notice:', linkErr.message);
                    }
                }

                // 3. Create Transaction Record for Dashboard
                const transaction = new Transaction({
                    user: merchant._id,
                    type: 'deposit',
                    amount: netAmount,
                    currency: currKey,
                    status: 'completed',
                    reference: reference,
                    description: metadata.linkId 
                        ? `Payment Link Funded: ${currency} ${amountPaid} from ${metadata.guestName || customerEmail}`
                        : `Direct Bank Transfer (DVA) Funded: ${currency} ${amountPaid}`
                });

                await transaction.save();
                console.log(`[DEPOSIT CONFIRMED] Credited ₦${netAmount} (Net) to ${merchant.email}`);
            }
        }

        res.sendStatus(200);
    } catch (err) {
        console.error('Webhook processing error:', err.message || err);
        res.status(500).send('Server error');
    }
});

module.exports = router;