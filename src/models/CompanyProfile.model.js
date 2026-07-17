const mongoose = require('mongoose');

const companyProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  companyName: {
    type: String,
    required: true,
    trim: true
  },
  openingBalance: {
    type: Number,
    default: 0
  },
  openingBalanceDate: {
    type: Date,
    default: null
  },
  openingFine: {
    type: Number,
    default: 0
  },
  openingFineDate: {
    type: Date,
    default: null
  },
  openingFine9999: {
    type: Number,
    default: 0
  },
  openingFine9999Date: {
    type: Date,
    default: null
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

module.exports = mongoose.model('CompanyProfile', companyProfileSchema);
