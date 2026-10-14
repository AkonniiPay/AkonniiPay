const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    address: { type: String, required: true }, // Physical address required for compliance
    tier: { type: String, default: 'Tier 1' },
    kycStatus: { type: String, enum: ['unverified', 'pending', 'verified'], default: 'unverified' },
    bvn: { type: String },
    nin: { type: String },
    walletBalance: { type: Number, default: 0 }, // Legacy USD primary
    wallets: {
        usd: { type: Number, default: 0 },
        eur: { type: Number, default: 0 },
        gbp: { type: Number, default: 0 },
        ngn: { type: Number, default: 0 }
    },
    accounts: {
        type: Object,
        default: {}
    }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);