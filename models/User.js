const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    walletBalance: { type: Number, default: 0 },

    // Verification & Compliance
    isEmailVerified: { type: Boolean, default: false },
    tier: { type: String, enum: ['Tier 1', 'Tier 2'], default: 'Tier 1' },
    bvn: { type: String, default: null },
    nin: { type: String, default: null },
    isKycVerified: { type: Boolean, default: false },

    // Dedicated Virtual Accounts
    accounts: {
        usd: {
            bankName: { type: String, default: 'Community Federal Savings Bank' },
            accountNumber: { type: String, default: null },
            routingNumber: { type: String, default: null }
        },
        eur: {
            bankName: { type: String, default: 'Banking Circle S.A.' },
            iban: { type: String, default: null },
            bic: { type: String, default: null }
        },
        gbp: {
            bankName: { type: String, default: 'Modulr FS Limited' },
            accountNumber: { type: String, default: null },
            sortCode: { type: String, default: null }
        },
        ngn: {
            bankName: { type: String, default: 'Wema Bank' },
            accountNumber: { type: String, default: null }
        }
    },

    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);