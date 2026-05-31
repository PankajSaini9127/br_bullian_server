const mongoose = require('mongoose');

const saudaSchema = new mongoose.Schema({
  saudaNo: {
    type: String,
    unique: true,
    trim: true
  },
  partyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Party',
    required: true
  },
  saudaDate: {
    type: Date,
    required: true
  },
  quantity: {
    type: Number,
    required: true
  },
  delivered: {
    type: Number,
    default: 0
  },
  rate: {
    type: Number,
    required: true
  },
  saudaType: {
    type: String,
    enum: ['sales', 'purchase'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'delivered', 'closed', 'partial', 'cross'],
    default: 'pending'
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

module.exports = mongoose.model('Sauda', saudaSchema);
