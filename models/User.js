const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  name: { type: String },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phoneNumber: { type: String, default: '' },
  address: { type: String, default: '' },
  occupation: { type: String, default: '' },
  kycStatus: { type: String, default: 'Pending Verification' },
  bvn: { type: String, default: '' },
  nin: { type: String, default: '' },
  balances: {
    NGN: { type: Number, default: 0 },
    USD: { type: Number, default: 0 },
    GBP: { type: Number, default: 0 }
  },
  virtualAccounts: {
    NGN: {
      bankName: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      accountName: { type: String, default: '' }
    },
    USD: { type: Object, default: {} },
    GBP: { type: Object, default: {} },
    EUR: { type: Object, default: {} }
  }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);