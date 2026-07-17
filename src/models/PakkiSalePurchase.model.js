const mongoose = require('mongoose');

const pakkiSalePurchaseSchema = new mongoose.Schema({
  invoiceNo: {
    type: String,
    unique: true,
    trim: true
  },
  partyName: {
    type: String,
    trim: true
  },
  partyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Party',
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  weight: {
    type: Number,
    default: 0
  },
  pcs: {
    type: Number,
    default: 0
  },
  type: {
    type: String,
    enum: ['buy', 'sell'],
    required: true
  },
  chorsaType: {
    type: String,
    enum: ['chorsa-999', 'bank-9999'],
    default: 'chorsa-999'
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

pakkiSalePurchaseSchema.index({ isDeleted: 1, date: 1 });
pakkiSalePurchaseSchema.index({ partyId: 1, isDeleted: 1 });

module.exports = mongoose.model('PakkiSalePurchase', pakkiSalePurchaseSchema);
