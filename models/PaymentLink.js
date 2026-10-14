const mongoose = require('mongoose');

const PaymentLinkSchema = new mongoose.Schema({
  merchant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'USD' },
  description: { type: String, default: '' },
  slug: { type: String, required: true, unique: true },
  isActive: { type: Boolean, default: true },
  expiresAt: { type: Date, default: null }, // Null means never expires
  paidCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PaymentLink', PaymentLinkSchema);