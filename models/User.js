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

    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);