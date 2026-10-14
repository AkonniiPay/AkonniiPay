const router = require('express').Router();
const https = require('https');
const auth = require('../middleware/auth');
const PaymentLink = require('../models/PaymentLink');

// Helper function to make HTTP requests safely
const makeHttpRequest = (options, postData) => {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', (err) => reject(err));
        if (postData) req.write(postData);
        req.end();
    });
};

// 1. SAVE AND INITIALIZE PAYMENT LINK
router.post('/initialize', auth, async (req, res) => {
    try {
        const { amount, currency, title } = req.body;

        if (!amount || !currency || !title) {
            return res.status(400).json({ message: 'Amount, currency, and title are required.' });
        }

        const formattedCurrency = currency.toUpperCase();
        let checkoutUrl = '';
        let reference = '';

        // ROUTE TO PAYSTACK FOR NAIRA (NGN)
        if (formattedCurrency === 'NGN') {
            const postData = JSON.stringify({
                email: req.user.email || 'guest@akonniipay.com',
                amount: Math.round(amount * 100),
                currency: 'NGN',
                metadata: { title }
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
            if (!response.status) {
                return res.status(400).json({ message: response.message || 'Paystack initialization failed.' });
            }

            checkoutUrl = response.data.authorization_url;
            reference = response.data.reference;
        } 
        // ROUTE TO FLUTTERWAVE FOR INTERNATIONAL (USD, GBP, EUR, CAD, GHS)
        else {
            reference = `AKP_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            const postData = JSON.stringify({
                tx_ref: reference,
                amount,
                currency: formattedCurrency,
                redirect_url: 'https://akonniipay.onrender.com/dashboard',
                customer: { email: req.user.email || 'guest@akonniipay.com' },
                customizations: {
                    title: title || 'AkonniiPay Checkout',
                    description: 'Direct Client Payment'
                }
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
            if (response.status !== 'success') {
                return res.status(400).json({ message: response.message || 'Flutterwave initialization failed.' });
            }

            checkoutUrl = response.data.link;
        }

        // SAVE LINK RECORD TO MONGODB
        const newLink = new PaymentLink({
            userId: req.user.id,
            title,
            amount,
            currency: formattedCurrency,
            url: checkoutUrl
        });

        await newLink.save();

        res.json({
            message: 'Payment link created and saved successfully!',
            checkoutUrl,
            reference,
            link: newLink
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. GET ALL PAYMENT LINKS FOR LOGGED-IN MERCHANT
router.get('/my-links', auth, async (req, res) => {
    try {
        const links = await PaymentLink.find({ userId: req.user.id }).sort({ createdAt: -1 });
        res.json({ links });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;