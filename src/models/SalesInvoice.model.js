const mongoose = require('mongoose');

const salesInvoiceSchema = new mongoose.Schema({
  salesInvoiceNo: {
    type: String,
    unique: true,
    trim: true
  },
  partyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Party',
    required: true
  },
  invoiceDate: {
    type: Date,
    required: true
  },
  paggaIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pugga'
  }],
  totalAmount: {
    type: Number,
    default: 0
  },
  isReturn: {
    type: Boolean,
    default: false
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

module.exports = mongoose.model('SalesInvoice', salesInvoiceSchema);
