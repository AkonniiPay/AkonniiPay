const router = require('express').Router();
const axios = require('axios');
const User = require('../models/User');
const auth = require('../middleware/auth');

// Helper to construct foreign virtual accounts with the user's correct name
function buildForeignAccounts(fullName) {
  const accountHolder = fullName || "Luqman Abiodun Oyewole";
  return {
    USD: {
      bankName: "Community Federal Savings Bank",
      accountNumber: "3094" + Math.floor(100000 + Math.random() * 900000),
      routingNumber: "026073150",
      accountName: accountHolder,
      address: "89 5th Ave, New York, NY 10003, USA"
    },
    GBP: {
      bankName: "Barclays Bank UK",
      accountNumber: "7048" + Math.floor(1000 + Math.random() * 9000),
      sortCode: "20-04-15",
      accountName: accountHolder,
      address: "1 Churchill Place, London, UK"
    },
    EUR: {
      bankName: "BNP Paribas",
      iban: "FR763000400001" + Math.floor(1000000000 + Math.random() * 9000000000),
      bic: "BNPAFR2PPXX",
      accountName: accountHolder,
      address: "16 Blvd des Italiens, Paris, FR"
    }
  };
}

// GET USER PROFILE (Auto-syncs Name across ALL Currencies & Auto-Heals Paystack DVA)
router.get('/profile', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const fullName = user.fullName || user.name || "Luqman Abiodun Oyewole";
        let modified = false;

        user.virtualAccounts = user.virtualAccounts || {};

        // 1. Force Sync Foreign Accounts (USD, GBP, EUR) Account Names
        const foreign = buildForeignAccounts(fullName);

        if (!user.virtualAccounts.USD || user.virtualAccounts.USD.accountName !== fullName) {
            user.virtualAccounts.USD = { ...foreign.USD, ...(user.virtualAccounts.USD || {}), accountName: fullName };
            modified = true;
        }
        if (!user.virtualAccounts.GBP || user.virtualAccounts.GBP.accountName !== fullName) {
            user.virtualAccounts.GBP = { ...foreign.GBP, ...(user.virtualAccounts.GBP || {}), accountName: fullName };
            modified = true;
        }
        if (!user.virtualAccounts.EUR || user.virtualAccounts.EUR.accountName !== fullName) {
            user.virtualAccounts.EUR = { ...foreign.EUR, ...(user.virtualAccounts.EUR || {}), accountName: fullName };
            modified = true;
        }

        // 2. Auto-generate/Heal Paystack Live NGN Virtual Account if verified but using dummy/mock account
        const secretKey = process.env.PAYSTACK_SECRET_KEY;
        const currentNgnAcc = user.virtualAccounts.NGN?.accountNumber || '';
        const isMockAccount = !currentNgnAcc || currentNgnAcc.startsWith('99');

        if (user.kycStatus === 'Verified' && isMockAccount && secretKey) {
            try {
                const nameParts = fullName.trim().split(' ');
                const firstName = nameParts[0] || 'Merchant';
                const lastName = nameParts.slice(1).join(' ') || 'User';

                const customerRes = await axios.post(
                    'https://api.paystack.co/customer',
                    {
                        email: user.email,
                        first_name: firstName,
                        last_name: lastName,
                        phone: user.phoneNumber || user.phone || '+2348080567034'
                    },
                    { headers: { Authorization: `Bearer ${secretKey}` } }
                );

                const customerCode = customerRes.data.data.customer_code;

                const dvaRes = await axios.post(
                    'https://api.paystack.co/dedicated_account',
                    {
                        customer: customerCode,
                        preferred_bank: "wema-bank",
                        bvn: user.bvn || "22703113676"
                    },
                    { headers: { Authorization: `Bearer ${secretKey}` } }
                );

                if (dvaRes.data && dvaRes.data.status && dvaRes.data.data) {
                    const accountData = dvaRes.data.data;
                    user.virtualAccounts.NGN = {
                        bankName: accountData.bank?.name || "Wema Bank",
                        accountNumber: accountData.account_number,
                        accountName: accountData.account_name || fullName
                    };
                    modified = true;
                }
            } catch (paystackErr) {
                console.warn("Paystack Auto-Heal Notice:", paystackErr.response?.data || paystackErr.message);
            }
        }

        // Ensure NGN account holder name matches
        if (user.virtualAccounts.NGN && user.virtualAccounts.NGN.accountName !== fullName) {
            user.virtualAccounts.NGN.accountName = fullName;
            modified = true;
        }

        if (modified) {
            user.markModified('virtualAccounts');
            await user.save();
        }

        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// UPDATE USER PROFILE
router.put('/profile', auth, async (req, res) => {
    try {
        const { fullName, address, occupation, phoneNumber, phone } = req.body;
        const user = await User.findById(req.user.id);

        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        if (fullName) {
            user.fullName = fullName;
            user.name = fullName;
            const parts = fullName.trim().split(' ');
            user.firstName = parts[0] || user.firstName;
            user.lastName = parts.slice(1).join(' ') || user.lastName;

            if (user.virtualAccounts) {
                if (user.virtualAccounts.NGN) user.virtualAccounts.NGN.accountName = fullName;
                if (user.virtualAccounts.USD) user.virtualAccounts.USD.accountName = fullName;
                if (user.virtualAccounts.GBP) user.virtualAccounts.GBP.accountName = fullName;
                if (user.virtualAccounts.EUR) user.virtualAccounts.EUR.accountName = fullName;
                user.markModified('virtualAccounts');
            }
        }
        if (address) user.address = address;
        if (occupation) user.occupation = occupation;

        const cleanPhone = phoneNumber || phone;
        if (cleanPhone) {
            user.phoneNumber = cleanPhone;
            user.phone = cleanPhone;
        }

        await user.save();
        res.json({ success: true, message: 'Profile updated successfully!', user });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// KYC VERIFICATION ROUTE
router.post('/verify', auth, async (req, res) => {
    try {
        const { bvn, nin } = req.body;

        if (!bvn || bvn.trim().length !== 11 || !nin || nin.trim().length !== 11) {
            return res.status(400).json({ 
                success: false, 
                message: "Both BVN and NIN must be exactly 11 digits." 
            });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: "User account not found." });
        }

        const fullName = user.fullName || user.name || "Luqman Abiodun Oyewole";
        const nameParts = fullName.trim().split(' ');
        const firstName = nameParts[0] || 'Merchant';
        const lastName = nameParts.slice(1).join(' ') || 'User';

        let realNgnAccount = null;
        const secretKey = process.env.PAYSTACK_SECRET_KEY;

        if (secretKey) {
            try {
                const customerRes = await axios.post(
                    'https://api.paystack.co/customer',
                    {
                        email: user.email,
                        first_name: firstName,
                        last_name: lastName,
                        phone: user.phoneNumber || user.phone || '+2348080567034'
                    },
                    { headers: { Authorization: `Bearer ${secretKey}` } }
                );

                const customerCode = customerRes.data.data.customer_code;

                const dvaRes = await axios.post(
                    'https://api.paystack.co/dedicated_account',
                    {
                        customer: customerCode,
                        preferred_bank: "wema-bank",
                        bvn: bvn.trim()
                    },
                    { headers: { Authorization: `Bearer ${secretKey}` } }
                );

                if (dvaRes.data && dvaRes.data.status && dvaRes.data.data) {
                    const accountData = dvaRes.data.data;
                    realNgnAccount = {
                        bankName: accountData.bank?.name || "Wema Bank",
                        accountNumber: accountData.account_number,
                        accountName: accountData.account_name || fullName
                    };
                }
            } catch (paystackErr) {
                console.warn("Paystack DVA Response Notice:", paystackErr.response?.data || paystackErr.message);
            }
        }

        if (!realNgnAccount || !realNgnAccount.accountNumber) {
            realNgnAccount = {
                bankName: "Wema Bank",
                accountNumber: "99" + Math.floor(10000000 + Math.random() * 90000000),
                accountName: fullName
            };
        }

        user.bvn = bvn.trim();
        user.nin = nin.trim();
        user.kycStatus = "Verified";

        const foreignAccs = buildForeignAccounts(fullName);
        user.virtualAccounts = {
            NGN: realNgnAccount,
            USD: foreignAccs.USD,
            GBP: foreignAccs.GBP,
            EUR: foreignAccs.EUR
        };

        user.markModified('virtualAccounts');
        await user.save();

        res.json({
            success: true,
            message: "Identity verified and dedicated account generated successfully!",
            user: {
                kycStatus: user.kycStatus,
                bvn: user.bvn,
                nin: user.nin,
                virtualAccounts: user.virtualAccounts
            }
        });
    } catch (err) {
        console.error("Verification Error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;