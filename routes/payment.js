const router = require('express').Router();
const https = require('https');
const auth = require('../middleware/auth');
const PaymentLink = require('../models/PaymentLink');
const Transaction = require('../models/Transaction');
const User = require('../models/User');

const makeHttpRequest = (options, postData) => {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
        });
        req.on('error', (err) => reject(err));
        if (postData) req.write(postData);
        req.end();
    });
};

// 1. INITIALIZE PAYMENT LINK
router.post('/initialize', auth, async (req, res) => {
    try {
        const { amount, currency, title } = req.body;
        if (!amount || !currency || !title) {
            return res.status(400).json({ message: 'Amount, currency, and title are required.' });
        }

        const formattedCurrency = currency.toUpperCase();
        let checkoutUrl = '';
        let reference = '';

        if (formattedCurrency === 'NGN') {
            reference = `AKP_NGN_${Date.now()}`;
            const postData = JSON.stringify({
                email: req.user.email,
                amount: Math.round(amount * 100),
                currency: 'NGN',
                reference,
                metadata: { title, userId: req.user.id }
            });

            const options = {
                hostname: 'api.paystack.co',
                port: 443,
                path: '/transaction/initialize',
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json',
                    'Content-Length': postData.length
                }
            };

            const response = await makeHttpRequest(options, postData);
            if (!response.status) return res.status(400).json({ message: response.message });

            checkoutUrl = response.data.authorization_url;
        } else {
            reference = `AKP_FLW_${Date.now()}`;
            const postData = JSON.stringify({
                tx_ref: reference,
                amount,
                currency: formattedCurrency,
                redirect_url: 'https://akonniipay.onrender.com/dashboard',
                customer: { email: req.user.email },
                customizations: { title, description: 'AkonniiPay Checkout' }
            });

            const options = {
                hostname: 'api.flutterwave.com',
                port: 443,
                path: '/v3/payments',
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
                    'Content-Type': 'application/json',
                    'Content-Length': postData.length
                }
            };

            const response = await makeHttpRequest(options, postData);
            if (response.status !== 'success') return res.status(400).json({ message: response.message });

            checkoutUrl = response.data.link;
        }

        const newLink = new PaymentLink({
            userId: req.user.id,
            title,
            amount,
            currency: formattedCurrency,
            url: checkoutUrl
        });

        await newLink.save();
        res.json({ message: 'Payment link created successfully!', checkoutUrl, reference });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. VERIFY TRANSACTION AND CREDIT WALLET BALANCE
router.post('/verify', auth, async (req, res) => {
    try {
        const { reference } = req.body;
        if (!reference) return res.status(400).json({ message: 'Reference is required.' });

        // Check if transaction was already recorded
        const existingTx = await Transaction.findOne({ reference });
        if (existingTx) {
            return res.json({ message: 'Transaction already verified and credited!', transaction: existingTx });
        }

        let amountCredited = 0;
        let currencyUsed = 'NGN';

        // Verify with Paystack if NGN reference
        if (reference.startsWith('AKP_NGN')) {
            const options = {
                hostname: 'api.paystack.co',
                port: 443,
                path: `/transaction/verify/${reference}`,
                method: 'GET',
                headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
            };

            const response = await makeHttpRequest(options);
            if (!response.status || response.data.status !== 'success') {
                return res.status(400).json({ message: 'Transaction not successful on Paystack yet.' });
            }

            amountCredited = response.data.amount / 100;
            currencyUsed = response.data.currency;
        } else {
            return res.status(400).json({ message: 'Invalid transaction reference format.' });
        }

        // Save Transaction Record
        const newTx = new Transaction({
            userId: req.user.id,
            reference,
            amount: amountCredited,
            currency: currencyUsed,
            gateway: 'Paystack',
            status: 'Success',
            title: 'Direct Payment'
        });
        await newTx.save();

        // Credit User Wallet Balance
        const user = await User.findById(req.user.id);
        if (currencyUsed === 'NGN') {
            user.ngnBalance += amountCredited;
        } else {
            user.usdBalance += amountCredited;
        }
        await user.save();

        res.json({ message: 'Wallet credited successfully!', newBalance: user.ngnBalance, transaction: newTx });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. GET MERCHANT LINKS & WALLET BALANCES
router.get('/my-links', auth, async (req, res) => {
    try {
        const links = await PaymentLink.find({ userId: req.user.id }).sort({ createdAt: -1 });
        const user = await User.findById(req.user.id).select('ngnBalance usdBalance');
        res.json({ links, ngnBalance: user.ngnBalance, usdBalance: user.usdBalance });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. GET ALL TRANSACTIONS
router.get('/transactions', auth, async (req, res) => {
    try {
        const transactions = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
        res.json({ transactions });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;