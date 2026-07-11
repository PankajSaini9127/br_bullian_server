const mongoose = require('mongoose');

const physicalStockVerificationSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true
  },
  physicalFine999: {
    type: Number,
    required: true
  },
  physicalBalance: {
    type: Number,
    required: true
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

module.exports = mongoose.model('PhysicalStockVerification', physicalStockVerificationSchema);
