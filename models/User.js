const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    occupation: { type: String, required: true },
    address: { type: String, default: '' },
    bvn: { type: String, default: '' },
    nin: { type: String, default: '' },
    kycStatus: { type: String, default: 'Pending Verification' },
    ngnBalance: { type: Number, default: 0 },
    usdBalance: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);