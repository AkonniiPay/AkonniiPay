const mongoose = require('mongoose');

const PaymentLinkSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true, uppercase: true },
    url: { type: String, required: true },
    reference: { type: String, required: true, unique: true },
    status: { type: String, default: 'Active' }, // Active, Closed, Expired
    chargeBearer: { type: String, default: 'merchant' }, // 'merchant' or 'payer'
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PaymentLink', PaymentLinkSchema);