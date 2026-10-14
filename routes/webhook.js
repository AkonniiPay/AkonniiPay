const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const PaymentLink = require('../models/PaymentLink');

// POST /api/webhook/paystack
router.post('/paystack', async (req, res) => {
    try {
        // Validate Webhook Signature
        const secret = process.env.PAYSTACK_SECRET_KEY || 'sk_test_sample_secret';
        const hash = crypto.createHmac('sha512', secret).update(JSON.stringify(req.body)).digest('hex');

        if (hash !== req.headers['x-paystack-signature']) {
            return res.status(400).send('Invalid signature');
        }

        const event = req.body;

        // Process successful charge event
        if (event.event === 'charge.success') {
            const data = event.data;
            const reference = data.reference;
            const amountPaid = data.amount / 100; // Convert subunits back to main unit
            const currency = data.currency;
            const metadata = data.metadata || {};

            // Prevent duplicate transaction processing
            const existingTx = await Transaction.findOne({ reference });
            if (existingTx) {
                return res.status(200).send('Event already processed');
            }

            let merchant = null;

            if (metadata.merchantId) {
                merchant = await User.findById(metadata.merchantId);
            }

            if (merchant) {
                // Credit merchant wallet
                merchant.walletBalance = (merchant.walletBalance || 0) + amountPaid;
                await merchant.save();

                // Increment Payment Link usage if applicable
                if (metadata.linkId) {
                    await PaymentLink.findByIdAndUpdate(metadata.linkId, { $inc: { paidCount: 1 } });
                }

                // Record transaction
                const transaction = new Transaction({
                    user: merchant._id,
                    type: 'deposit',
                    amount: amountPaid,
                    currency: currency || 'USD',
                    status: 'completed',
                    reference,
                    description: `Webhook Funded: ${currency} ${amountPaid} from ${metadata.guestName || data.customer.email}`
                });

                await transaction.save();
            }
        }

        res.sendStatus(200);
    } catch (err) {
        console.error('Webhook error:', err.message);
        res.status(500).send('Server error');
    }
});

module.exports = router;