const mongoose = require('mongoose');

const saudaCrosscutSchema = new mongoose.Schema({
  sourceSaudaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sauda',
    required: true
  },
  targetSaudaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sauda',
    required: true
  },
  crosscutDate: {
    type: Date,
    required: true
  },
  crosscutQuantity: {
    type: Number,
    required: true
  },
  sourceRate: {
    type: Number,
    required: true
  },
  targetRate: {
    type: Number,
    required: true
  },
  targetQuantity: {
    type: Number,
    required: true
  },
  profitLoss: {
    type: Number,
    required: true
  },
  creditDebitType: {
    type: String,
    enum: ['credit', 'debit'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  description: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'cancelled'],
    default: 'pending'
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

module.exports = mongoose.model('SaudaCrosscut', saudaCrosscutSchema);
