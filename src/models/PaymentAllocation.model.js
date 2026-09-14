const mongoose = require('mongoose');

const paymentAllocationSchema = new mongoose.Schema({
  paymentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment',
    required: true
  },
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'invoiceType'
  },
  invoiceType: {
    type: String,
    required: true,
    enum: ['Invoice', 'SalesInvoice', 'Sauda']
  },
  amount: {
    type: Number,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('PaymentAllocation', paymentAllocationSchema);
