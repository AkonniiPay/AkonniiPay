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

            // Seed unique numeric identifier
            const seed = user._id.toString().substring(18);
            const numericAccount = '210' + parseInt(seed, 16).toString().padStart(9, '0').slice(0, 9);

            user.accounts = {
                usd: {
                    accountName: user.name,
                    bankName: 'Lead Bank',
                    accountNumber: numericAccount,
                    accountType: 'Checking',
                    routingNumber: '101019644',
                    bankAddress: '1801 Main St. Kansas City, MO 64108, USA'
                },
                eur: {
                    accountName: user.name,
                    bankName: 'Banking Circle S.A.',
                    accountNumber: 'LU88' + numericAccount + '9827',
                    accountType: 'IBAN Current',
                    routingNumber: 'BCIRLULL',
                    bankAddress: '2 Boulevard de la Foire, L-1528 Luxembourg'
                },
                gbp: {
                    accountName: user.name,
                    bankName: 'Modulr FS Limited',
                    accountNumber: numericAccount.slice(0, 8),
                    accountType: 'Sort Code Account',
                    routingNumber: '04-00-04',
                    bankAddress: 'Scale Space, 58 Wood Lane, London W12 7RZ, UK'
                },
                ngn: {
                    accountName: user.name,
                    bankName: 'Wema Bank / AkonniiPay',
                    accountNumber: '70' + numericAccount.slice(2, 10),
                    accountType: 'Savings / Individual',
                    routingNumber: '035150103',
                    bankAddress: '54 Marina, Lagos Island, Lagos, Nigeria'
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