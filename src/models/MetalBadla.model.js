const mongoose = require('mongoose');

const metalBadlaSchema = new mongoose.Schema({
  badlaNo: {
    type: String,
    unique: true,
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
  paggaIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pugga'
  }],
  totalFine: {
    type: Number,
    default: 0
  },
  paltaPerKg: {
    type: Number,
    default: 0
  },
  requiredSilver: {
    type: Number,
    default: 0
  },
  chandiDeniHai: {
    type: Number,
    default: 0
  },
  givenSilver: {
    type: Number,
    default: 0
  },
  silverDifference: {
    type: Number,
    default: 0
  },
  silverRate: {
    type: Number,
    default: 0
  },
  transactionType: {
    type: String,
    enum: ['sales', 'purchase'],
    default: 'sales'
  },
  finalAmount: {
    type: Number,
    default: 0
  },
  bhavCutSaudaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sauda',
    default: null
  },
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
    default: null
  },
  remark: {
    type: String,
    trim: true
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
    ref: 'User',
    default: null
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
    ref: 'User',
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('MetalBadla', metalBadlaSchema);
