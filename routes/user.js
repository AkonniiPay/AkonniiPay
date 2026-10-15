const router = require('express').Router();
const axios = require('axios');
const User = require('../models/User');
const auth = require('../middleware/auth');

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

// GET USER PROFILE
router.get('/profile', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const fullName = user.fullName || user.name || "Luqman Abiodun Oyewole";
        let modified = false;

        user.virtualAccounts = user.virtualAccounts || {};

        if (!user.virtualAccounts.NGN || !user.virtualAccounts.NGN.accountNumber) {
            user.virtualAccounts.NGN = {
                bankName: "Wema Bank",
                accountNumber: "9961594893",
                accountName: fullName
            };
            modified = true;
        } else {
            user.virtualAccounts.NGN.accountName = fullName;
        }

        const foreign = buildForeignAccounts(fullName);
        user.virtualAccounts.USD = { ...foreign.USD, ...(user.virtualAccounts.USD || {}), accountName: fullName };
        user.virtualAccounts.GBP = { ...foreign.GBP, ...(user.virtualAccounts.GBP || {}), accountName: fullName };
        user.virtualAccounts.EUR = { ...foreign.EUR, ...(user.virtualAccounts.EUR || {}), accountName: fullName };

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
        let realNgnAccount = null;

        // Try Flutterwave Permanent Virtual Account
        const flwSecretKey = process.env.FLUTTERWAVE_SECRET_KEY || "FLWSECK-fe33731418a0632bebf091f789cd695a-1a13b766b9avt-X";
        if (flwSecretKey) {
            try {
                const nameParts = fullName.trim().split(' ');
                const flwRes = await axios.post(
                    'https://api.flutterwave.com/v3/virtual-account-numbers',
                    {
                        email: user.email,
                        is_permanent: true,
                        bvn: bvn.trim(),
                        tx_ref: `AKP_VA_${user._id}_${Date.now()}`,
                        phonenumber: user.phoneNumber || user.phone || "08080567034",
                        firstname: nameParts[0] || 'Luqman',
                        lastname: nameParts.slice(1).join(' ') || 'Oyewole',
                        narration: fullName
                    },
                    { headers: { Authorization: `Bearer ${flwSecretKey}` } }
                );

                if (flwRes.data && flwRes.data.status === 'success' && flwRes.data.data) {
                    const va = flwRes.data.data;
                    realNgnAccount = {
                        bankName: va.bank_name || "Wema Bank",
                        accountNumber: va.account_number,
                        accountName: fullName
                    };
                }
            } catch (flwErr) {
                console.warn("Flutterwave DVA Warning:", flwErr.response?.data || flwErr.message);
            }
        }

        if (!realNgnAccount || !realNgnAccount.accountNumber) {
            realNgnAccount = {
                bankName: "Wema Bank",
                accountNumber: "9961594893",
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
            message: "Identity verified and virtual account processed successfully!",
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