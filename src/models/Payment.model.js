const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  paymentNo: {
    type: String,
    unique: true,
    sparse: true
  },
  partyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Party',
    required: true
  },
  paymentDate: {
    type: Date,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  paymentType: {
    type: String,
    enum: ['incoming', 'outgoing'],
    required: true
  },
  paymentMode: {
    type: String,
    enum: ['cash', 'bank_transfer', 'cheque', 'upi'],
    default: 'cash'
  },
  remark: {
    type: String
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  deletedAt: {
    type: Date
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

paymentSchema.index({ isDeleted: 1, paymentDate: 1 });
paymentSchema.index({ partyId: 1, isDeleted: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
