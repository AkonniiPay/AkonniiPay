const mongoose = require('mongoose');

const PaymentLinkSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    title: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true, uppercase: true },
    url: { type: String, required: true },
    shortUrl: { type: String },
    reference: { type: String, required: true, unique: true },
    slug: { type: String, sparse: true, unique: true }, // Added sparse slug to match payment.js
    status: { type: String, default: 'Active' }, // Active, Closed, Expired
    chargeBearer: { type: String, default: 'merchant' }, // 'merchant' or 'payer'
    feeBearer: { type: String, default: 'payer' },
    expiresAt: { type: Date, required: true },
    expiryDate: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PaymentLink', PaymentLinkSchema);