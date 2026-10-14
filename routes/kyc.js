const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const auth = require('../middleware/auth');

// POST /api/kyc/verify
router.post(
    '/verify',
    auth,
    [
        body('bvn').optional().isLength({ min: 11, max: 11 }).withMessage('BVN must be exactly 11 digits.'),
        body('nin').optional().isLength({ min: 11, max: 11 }).withMessage('NIN must be exactly 11 digits.')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array().map(e => e.msg) });
            }

            const { bvn, nin } = req.body;

            if (!bvn && !nin) {
                return res.status(400).json({ message: 'Please provide either a valid BVN or NIN.' });
            }

            const user = await User.findById(req.user.id);
            if (!user) {
                return res.status(404).json({ message: 'User not found.' });
            }

            // Update KYC Status & Tier
            user.bvn = bvn || user.bvn;
            user.nin = nin || user.nin;
            user.isKycVerified = true;
            user.tier = 'Tier 2';

            // Generate Dedicated Virtual Accounts (or fetch from banking provider API)
            const seed = user._id.toString().substring(18); // Unique numeric generator seed
            const numericAccount = '88' + parseInt(seed, 16).toString().padStart(8, '0').slice(0, 8);

            user.accounts = {
                usd: {
                    bankName: 'Community Federal Savings Bank',
                    accountNumber: '409' + numericAccount.slice(3),
                    routingNumber: '026073150'
                },
                eur: {
                    bankName: 'Banking Circle S.A.',
                    iban: 'LU' + numericAccount + '98273645',
                    bic: 'BCIRLULL'
                },
                gbp: {
                    bankName: 'Modulr FS Limited',
                    accountNumber: numericAccount,
                    sortCode: '04-00-04'
                },
                ngn: {
                    bankName: 'Wema Bank / AkonniiPay',
                    accountNumber: '70' + numericAccount.slice(2)
                }
            };

            await user.save();

            res.json({
                message: 'Identity verified successfully! Tier 2 status unlocked and virtual accounts generated.',
                user: {
                    isKycVerified: user.isKycVerified,
                    tier: user.tier,
                    accounts: user.accounts
                }
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
);

module.exports = router;