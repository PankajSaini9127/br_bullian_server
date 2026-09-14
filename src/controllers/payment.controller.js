// Nodemon auto-reload trigger
const mongoose = require('mongoose');
const Payment = require('../models/Payment.model');
const Party = require('../models/Party.model');
const PaymentAllocation = require('../models/PaymentAllocation.model');
const Invoice = require('../models/Invoice.model');
const SalesInvoice = require('../models/SalesInvoice.model');
const Sauda = require('../models/Sauda.model');
const { generatePaymentNo } = require('../utils/paymentGenerator');
const { calculateCashInHand } = require('./dashboard.controller');

const createPayment = async (req, res) => {
  try {
    const { partyId, paymentDate, amount, paymentType, paymentMode, remark, allocations } = req.body;

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

    const numAmount = Number(amount);
    let totalAllocated = 0;
    const invoiceUpdates = [];

    if (allocations && Array.isArray(allocations) && allocations.length > 0) {
      for (const alloc of allocations) {
        if (!alloc.invoiceId || !alloc.invoiceType || !alloc.amount || alloc.amount <= 0) {
          continue;
        }

        let invoice;
        let resolvedType = alloc.invoiceType;

        // Dynamic resolution: Search SalesInvoice
        invoice = await SalesInvoice.findOne({ _id: alloc.invoiceId, isDeleted: false });
        if (invoice) {
          resolvedType = 'SalesInvoice';
        } else {
          // Search Invoice
          invoice = await Invoice.findOne({ _id: alloc.invoiceId, isDeleted: false });
          if (invoice) {
            resolvedType = 'Invoice';
          } else {
            // Search Sauda
            invoice = await Sauda.findOne({ _id: alloc.invoiceId, isDeleted: false });
            if (invoice) {
              resolvedType = 'Sauda';
            }
          }
        }

        if (!invoice) {
          return res.status(404).json({ success: false, message: `Invoice/Sauda ${alloc.invoiceId} not found` });
        }

        const totalAmount = resolvedType === 'Sauda'
          ? parseFloat((invoice.rate * (invoice.quantity / 1000)).toFixed(2))
          : (invoice.totalAmount || 0);

        const pending = parseFloat((totalAmount - (invoice.paidAmount || 0)).toFixed(2));
        if (Number(alloc.amount) > pending) {
          return res.status(400).json({
            success: false,
            message: `Allocated amount exceeds pending invoice balance. Invoice pending: ${pending}, Allocated: ${alloc.amount}`
          });
        }

        totalAllocated += Number(alloc.amount);
        
        invoiceUpdates.push({
          invoice,
          invoiceType: resolvedType,
          allocAmount: Number(alloc.amount)
        });
      }

      if (totalAllocated > numAmount) {
        return res.status(400).json({
          success: false,
          message: `Total allocated amount (${totalAllocated}) cannot exceed payment amount (${numAmount})`
        });
      }
    }

    const paymentNo = await generatePaymentNo(paymentType);
    const advanceRemaining = parseFloat((numAmount - totalAllocated).toFixed(2));

    const savedPayment = await Payment.create({
      paymentNo,
      partyId,
      paymentDate,
      amount: numAmount,
      advanceRemaining,
      paymentType,
      paymentMode: paymentMode || 'cash',
      remark,
      createdBy: req.user._id
    });

    // Create allocations & update Invoices
    for (const item of invoiceUpdates) {
      await PaymentAllocation.create({
        paymentId: savedPayment._id,
        invoiceId: item.invoice._id,
        invoiceType: item.invoiceType,
        amount: item.allocAmount,
        createdBy: req.user._id
      });

      item.invoice.paidAmount = parseFloat(((item.invoice.paidAmount || 0) + item.allocAmount).toFixed(2));
      const totalAmount = item.invoiceType === 'Sauda'
        ? parseFloat((item.invoice.rate * (item.invoice.quantity / 1000)).toFixed(2))
        : (item.invoice.totalAmount || 0);

      const pending = parseFloat((totalAmount - item.invoice.paidAmount).toFixed(2));
      if (pending <= 0) {
        item.invoice.paymentStatus = 'paid';
      } else if (item.invoice.paidAmount > 0) {
        item.invoice.paymentStatus = 'partial';
      } else {
        item.invoice.paymentStatus = 'unpaid';
      }
      await item.invoice.save();
    }

    const paymentObj = savedPayment.toObject();
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
    const payment = await Payment.findOne({ _id: req.params.id, isDeleted: false });
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    // Find allocations
    const allocations = await PaymentAllocation.find({ paymentId: payment._id, isDeleted: false });
    
    // Revert invoice balances
    for (const alloc of allocations) {
      let invoice;
      if (alloc.invoiceType === 'SalesInvoice') {
        invoice = await SalesInvoice.findOne({ _id: alloc.invoiceId, isDeleted: false });
      } else if (alloc.invoiceType === 'Invoice') {
        invoice = await Invoice.findOne({ _id: alloc.invoiceId, isDeleted: false });
      } else if (alloc.invoiceType === 'Sauda') {
        invoice = await Sauda.findOne({ _id: alloc.invoiceId, isDeleted: false });
      }

      if (invoice) {
        invoice.paidAmount = parseFloat(Math.max(0, (invoice.paidAmount || 0) - alloc.amount).toFixed(2));
        const totalAmount = alloc.invoiceType === 'Sauda'
          ? parseFloat((invoice.rate * (invoice.quantity / 1000)).toFixed(2))
          : (invoice.totalAmount || 0);
        const pending = parseFloat((totalAmount - invoice.paidAmount).toFixed(2));
        if (pending <= 0) {
          invoice.paymentStatus = 'paid';
        } else if (invoice.paidAmount > 0) {
          invoice.paymentStatus = 'partial';
        } else {
          invoice.paymentStatus = 'unpaid';
        }
        await invoice.save();
      }

      // Soft delete allocation
      alloc.isDeleted = true;
      alloc.deletedBy = req.user._id;
      await alloc.save();
    }

    // Soft delete payment
    payment.isDeleted = true;
    payment.deletedBy = req.user._id;
    payment.deletedAt = new Date();
    await payment.save();

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

    // Calculate actual live Cash in Hand (incorporating opening balance/latest verification)
    const cashInHand = await calculateCashInHand(req.user._id, new Date());

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
        balance,
        cashInHand
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
