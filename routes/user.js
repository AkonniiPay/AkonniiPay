const router = require('express').Router();
const User = require('../models/User');
const auth = require('../middleware/auth');

// Helper to construct foreign and local virtual account structures using user's full name
function buildVirtualAccounts(fullName) {
  const accountHolder = fullName || "Luqman Abiodun Oyewole";
  return {
    NGN: {
      bankName: "Wema Bank",
      accountNumber: "99" + Math.floor(10000000 + Math.random() * 90000000),
      accountName: accountHolder
    },
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

// GET USER PROFILE (Auto-Heal & Name Sync across all currencies)
router.get('/profile', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const currentName = user.fullName || user.name || "Luqman Abiodun Oyewole";

        // Auto-heal / generate or update virtual accounts with user's verified name
        if (user.kycStatus === 'Verified') {
            user.virtualAccounts = user.virtualAccounts || {};
            const built = buildVirtualAccounts(currentName);

            // Ensure NGN details
            if (!user.virtualAccounts.NGN || !user.virtualAccounts.NGN.accountNumber) {
                user.virtualAccounts.NGN = built.NGN;
            } else {
                user.virtualAccounts.NGN.accountName = currentName;
            }

            // Sync foreign currency account names
            user.virtualAccounts.USD = user.virtualAccounts.USD || built.USD;
            user.virtualAccounts.USD.accountName = currentName;

            user.virtualAccounts.GBP = user.virtualAccounts.GBP || built.GBP;
            user.virtualAccounts.GBP.accountName = currentName;

            user.virtualAccounts.EUR = user.virtualAccounts.EUR || built.EUR;
            user.virtualAccounts.EUR.accountName = currentName;

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

            // Instantly sync name across all virtual accounts
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

        user.bvn = bvn.trim();
        user.nin = nin.trim();
        user.kycStatus = "Verified";

        user.virtualAccounts = buildVirtualAccounts(fullName);
        user.markModified('virtualAccounts');
        await user.save();

        res.json({
            success: true,
            message: "Identity verified and saved successfully!",
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