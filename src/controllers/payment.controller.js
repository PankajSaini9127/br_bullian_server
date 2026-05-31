const Payment = require('../models/Payment.model');
const Party = require('../models/Party.model');
const { generatePaymentNo } = require('../utils/paymentGenerator');

const createPayment = async (req, res) => {
  try {
    const { partyId, paymentDate, amount, paymentType, paymentMode, remark } = req.body;

    if (!partyId || !paymentDate || !amount || !paymentType) {
      return res.status(400).json({
        success: false,
        message: 'Party id, payment date, amount, and payment type are required'
      });
    }

    const party = await Party.findOne({ _id: partyId, isDeleted: false });
    if (!party) {
      return res.status(404).json({ success: false, message: 'Party not found' });
    }

    const paymentNo = await generatePaymentNo(paymentType);

    const payment = await Payment.create({
      paymentNo,
      partyId,
      paymentDate,
      amount,
      paymentType,
      paymentMode: paymentMode || 'cash',
      remark,
      createdBy: req.user._id
    });

    const paymentObj = payment.toObject();
    paymentObj.party = party;

    res.status(201).json({
      success: true,
      message: 'Payment created successfully',
      data: { payment: paymentObj }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating payment',
      error: error.message
    });
  }
};

const getAllPayments = async (req, res) => {
  try {
    const { partyId, paymentType, startDate, endDate, page = 1, limit = 10 } = req.query;
    const filter = { isDeleted: false };

    if (partyId) filter.partyId = partyId;
    if (paymentType) filter.paymentType = paymentType;
    if (startDate && endDate) {
      filter.paymentDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const payments = await Payment.find(filter)
      .populate('partyId', 'partyName contactNo address email gstin')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await Payment.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        payments,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalItems: total,
          itemsPerPage: limitNum
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching payments',
      error: error.message
    });
  }
};

const getPaymentById = async (req, res) => {
  try {
    const payment = await Payment.findOne({ _id: req.params.id, isDeleted: false })
      .populate('partyId', 'partyName contactNo address email gstin');

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    res.status(200).json({
      success: true,
      data: { payment }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching payment',
      error: error.message
    });
  }
};

const updatePayment = async (req, res) => {
  try {
    const { partyId, paymentDate, amount, paymentType, paymentMode, remark, isActive } = req.body;

    if (partyId) {
      const party = await Party.findOne({ _id: partyId, isDeleted: false });
      if (!party) {
        return res.status(404).json({ success: false, message: 'Party not found' });
      }
    }

    const payment = await Payment.findByIdAndUpdate(
      req.params.id,
      { partyId, paymentDate, amount, paymentType, paymentMode, remark, isActive, updatedBy: req.user._id },
      { new: true, runValidators: true }
    ).populate('partyId', 'partyName contactNo address email gstin');

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Payment updated successfully',
      data: { payment }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating payment',
      error: error.message
    });
  }
};

const deletePayment = async (req, res) => {
  try {
    const payment = await Payment.findByIdAndUpdate(
      req.params.id,
      { isDeleted: true, deletedBy: req.user._id, deletedAt: new Date() },
      { new: true }
    );

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Payment deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting payment',
      error: error.message
    });
  }
};

const getCashBook = async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const payments = await Payment.find({
      isDeleted: false,
      paymentDate: { $gte: todayStart, $lte: todayEnd }
    })
      .populate('partyId', 'partyName contactNo address email gstin')
      .sort({ createdAt: -1 });

    const incomingPayments = payments.filter(p => p.paymentType === 'incoming');
    const outgoingPayments = payments.filter(p => p.paymentType === 'outgoing');

    const totalIncoming = incomingPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    const totalOutgoing = outgoingPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    const balance = totalIncoming - totalOutgoing;

    res.status(200).json({
      success: true,
      data: {
        date: todayStart,
        incoming: {
          payments: incomingPayments,
          total: totalIncoming
        },
        outgoing: {
          payments: outgoingPayments,
          total: totalOutgoing
        },
        balance
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching cash book',
      error: error.message
    });
  }
};

module.exports = {
  createPayment,
  getAllPayments,
  getPaymentById,
  updatePayment,
  deletePayment,
  getCashBook
};
