const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
  noteNo: {
    type: String,
    unique: true,
    trim: true
  },
  noteType: {
    type: String,
    enum: ['credit', 'debit'],
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  partyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Party',
    required: true
  },
  reason: {
    type: String,
    trim: true
  },
  amount: {
    type: Number,
    default: 0
  },
  fine: {
    type: Number,
    default: 0
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

module.exports = mongoose.model('Note', noteSchema);
