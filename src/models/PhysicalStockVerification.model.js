const mongoose = require('mongoose');

const physicalStockVerificationSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true
  },
  physicalFine999: {
    type: Number,
    default: 0
  },
  physicalBalance: {
    type: Number,
    default: 0
  },
  chorsa999: {
    systemWeight: { type: Number, default: 0 },
    systemPcs: { type: Number, default: 0 },
    systemBuy: { type: Number, default: 0 },
    systemSell: { type: Number, default: 0 },
    physicalWeight: { type: Number, default: 0 },
    remark: { type: String, default: '' }
  },
  bank9999: {
    systemWeight: { type: Number, default: 0 },
    systemPcs: { type: Number, default: 0 },
    systemBuy: { type: Number, default: 0 },
    systemSell: { type: Number, default: 0 },
    physicalWeight: { type: Number, default: 0 },
    remark: { type: String, default: '' }
  },
  cash: {
    systemIn: { type: Number, default: 0 },
    systemOut: { type: Number, default: 0 },
    systemNet: { type: Number, default: 0 },
    physicalBalance: { type: Number, default: 0 },
    remark: { type: String, default: '' }
  },
  remark: {
    type: String,
    default: ''
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

physicalStockVerificationSchema.index({ isDeleted: 1, date: -1 });

module.exports = mongoose.model('PhysicalStockVerification', physicalStockVerificationSchema);
