const mongoose = require('mongoose');
const PaymentAllocation = require('../models/PaymentAllocation.model');
const Payment = require('../models/Payment.model');
const Invoice = require('../models/Invoice.model');
const SalesInvoice = require('../models/SalesInvoice.model');
const Party = require('../models/Party.model');
const Sauda = require('../models/Sauda.model');

// 1. Get Outstanding Receivables (Aana) & Payables (Dena)
const getOutstanding = async (req, res) => {
  try {
    const parties = await Party.find({ isActive: true, isDeleted: false }).lean();
    
    const receivables = [];
    const payables = [];

    await Promise.all(parties.map(async (party) => {
      // Find pending sales invoices (Receivable)
      const salesInvoices = await SalesInvoice.find({
        partyId: party._id,
        isDeleted: false,
        paymentStatus: { $ne: 'paid' }
      }).lean();

      // Find pending sales saudas (Receivable)
      const salesSaudas = await Sauda.find({
        partyId: party._id,
        saudaType: 'sales',
        isBhavCut: true,
        isDeleted: false,
        paymentStatus: { $ne: 'paid' }
      }).lean();

      // Find incoming payments advance
      const incomingAdvances = await Payment.find({
        partyId: party._id,
        paymentType: 'incoming',
        isDeleted: false,
        advanceRemaining: { $gt: 0 }
      }).lean();

      // Calculate total pending sales amount
      let totalSalesPending = 0;
      salesInvoices.forEach(inv => {
        totalSalesPending += (inv.totalAmount || 0) - (inv.paidAmount || 0);
      });
      salesSaudas.forEach(sd => {
        const amt = sd.rate * (sd.quantity / 1000);
        totalSalesPending += amt - (sd.paidAmount || 0);
      });

      // Calculate total incoming advance
      const totalIncomingAdvance = incomingAdvances.reduce((sum, p) => sum + (p.advanceRemaining || 0), 0);

      if (totalSalesPending > 0 || totalIncomingAdvance > 0) {
        receivables.push({
          partyId: party._id,
          partyName: party.partyName,
          contactNo: party.contactNo || '-',
          totalPendingAmount: parseFloat(totalSalesPending.toFixed(2)),
          totalAdvanceAmount: parseFloat(totalIncomingAdvance.toFixed(2)),
          pendingCount: salesInvoices.length + salesSaudas.length,
          advanceCount: incomingAdvances.length
        });
      }

      // Find pending purchase invoices (Payable)
      const purchaseInvoices = await Invoice.find({
        partyId: party._id,
        isDeleted: false,
        paymentStatus: { $ne: 'paid' },
        isReturn: false // Exclude returns
      }).lean();

      // Find pending purchase saudas (Payable)
      const purchaseSaudas = await Sauda.find({
        partyId: party._id,
        saudaType: 'purchase',
        isBhavCut: true,
        isDeleted: false,
        paymentStatus: { $ne: 'paid' }
      }).lean();

      // Find outgoing payments advance
      const outgoingAdvances = await Payment.find({
        partyId: party._id,
        paymentType: 'outgoing',
        isDeleted: false,
        advanceRemaining: { $gt: 0 }
      }).lean();

      // Calculate total pending purchase amount
      let totalPurchasePending = 0;
      purchaseInvoices.forEach(inv => {
        totalPurchasePending += (inv.totalAmount || 0) - (inv.paidAmount || 0);
      });
      purchaseSaudas.forEach(sd => {
        const amt = sd.rate * (sd.quantity / 1000);
        totalPurchasePending += amt - (sd.paidAmount || 0);
      });

      // Calculate total outgoing advance
      const totalOutgoingAdvance = outgoingAdvances.reduce((sum, p) => sum + (p.advanceRemaining || 0), 0);

      if (totalPurchasePending > 0 || totalOutgoingAdvance > 0) {
        payables.push({
          partyId: party._id,
          partyName: party.partyName,
          contactNo: party.contactNo || '-',
          totalPendingAmount: parseFloat(totalPurchasePending.toFixed(2)),
          totalAdvanceAmount: parseFloat(totalOutgoingAdvance.toFixed(2)),
          pendingCount: purchaseInvoices.length + purchaseSaudas.length,
          advanceCount: outgoingAdvances.length
        });
      }
    }));

    // Sort by name
    receivables.sort((a, b) => a.partyName.localeCompare(b.partyName));
    payables.sort((a, b) => a.partyName.localeCompare(b.partyName));

    res.status(200).json({
      success: true,
      data: { receivables, payables }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching outstanding payment details',
      error: error.message
    });
  }
};

// 2. Get pending invoices for a specific party
const getPendingInvoices = async (req, res) => {
  try {
    const { partyId } = req.params;
    console.log('[GET PENDING INVOICES] Requested partyId:', partyId);
    
    // Pending Sales Invoices (Receivable)
    const salesInvoices = await SalesInvoice.find({
      partyId,
      isDeleted: false,
      paymentStatus: { $ne: 'paid' }
    }).sort({ invoiceDate: 1 }).lean();

    // Pending Sales Saudas (Receivable)
    const salesSaudas = await Sauda.find({
      partyId,
      saudaType: 'sales',
      isBhavCut: true,
      isDeleted: false,
      paymentStatus: { $ne: 'paid' }
    }).sort({ saudaDate: 1 }).lean();

    console.log('[GET PENDING INVOICES] Found raw sales invoices count:', salesInvoices.length, 'and saudas:', salesSaudas.length);

    // Pending Purchase Invoices (Payable)
    const purchaseInvoices = await Invoice.find({
      partyId,
      isDeleted: false,
      paymentStatus: { $ne: 'paid' },
      isReturn: false
    }).sort({ invoiceDate: 1 }).lean();

    // Pending Purchase Saudas (Payable)
    const purchaseSaudas = await Sauda.find({
      partyId,
      saudaType: 'purchase',
      isBhavCut: true,
      isDeleted: false,
      paymentStatus: { $ne: 'paid' }
    }).sort({ saudaDate: 1 }).lean();

    console.log('[GET PENDING INVOICES] Found raw purchase invoices count:', purchaseInvoices.length, 'and saudas:', purchaseSaudas.length);

    const mappedSales = [
      ...salesInvoices.map(inv => ({
        ...inv,
        pendingAmount: parseFloat(((inv.totalAmount || 0) - (inv.paidAmount || 0)).toFixed(2))
      })),
      ...salesSaudas.map(sd => {
        const totalAmount = parseFloat((sd.rate * (sd.quantity / 1000)).toFixed(2));
        return {
          _id: sd._id,
          salesInvoiceNo: sd.saudaNo,
          invoiceNo: sd.saudaNo,
          invoiceDate: sd.saudaDate,
          totalAmount,
          paidAmount: sd.paidAmount || 0,
          pendingAmount: parseFloat((totalAmount - (sd.paidAmount || 0)).toFixed(2)),
          paymentStatus: sd.paymentStatus,
          isSauda: true
        };
      })
    ];

    const mappedPurchases = [
      ...purchaseInvoices.map(inv => ({
        ...inv,
        pendingAmount: parseFloat(((inv.totalAmount || 0) - (inv.paidAmount || 0)).toFixed(2))
      })),
      ...purchaseSaudas.map(sd => {
        const totalAmount = parseFloat((sd.rate * (sd.quantity / 1000)).toFixed(2));
        return {
          _id: sd._id,
          salesInvoiceNo: sd.saudaNo,
          invoiceNo: sd.saudaNo,
          invoiceDate: sd.saudaDate,
          totalAmount,
          paidAmount: sd.paidAmount || 0,
          pendingAmount: parseFloat((totalAmount - (sd.paidAmount || 0)).toFixed(2)),
          paymentStatus: sd.paymentStatus,
          isSauda: true
        };
      })
    ];

    res.status(200).json({
      success: true,
      data: {
        salesInvoices: mappedSales,
        purchaseInvoices: mappedPurchases
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching pending invoices',
      error: error.message
    });
  }
};

// 3. Get remaining advances for a specific party
const getAdvances = async (req, res) => {
  try {
    const { partyId } = req.params;

    const advances = await Payment.find({
      partyId,
      isDeleted: false,
      advanceRemaining: { $gt: 0 }
    }).sort({ paymentDate: 1 }).lean();

    res.status(200).json({
      success: true,
      data: advances
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching advances',
      error: error.message
    });
  }
};

// 4. Settle Advance Payment against Invoice
const settleAdvance = async (req, res) => {
  try {
    const { paymentId, invoiceId, invoiceType, amount } = req.body;

    if (!paymentId || !invoiceId || !invoiceType || !amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'All fields are required and amount must be positive.' });
    }

    // 1. Fetch Payment (Advance)
    const payment = await Payment.findOne({ _id: paymentId, isDeleted: false });
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found.' });
    }
    if ((payment.advanceRemaining || 0) < amount) {
      return res.status(400).json({ success: false, message: `Insufficient advance! Remaining advance is only ${payment.advanceRemaining}g.` });
    }

    // 2. Fetch Invoice dynamically
    let invoice;
    let resolvedType = invoiceType;

    // Search SalesInvoice
    invoice = await SalesInvoice.findOne({ _id: invoiceId, isDeleted: false });
    if (invoice) {
      resolvedType = 'SalesInvoice';
    } else {
      // Search Invoice
      invoice = await Invoice.findOne({ _id: invoiceId, isDeleted: false });
      if (invoice) {
        resolvedType = 'Invoice';
      } else {
        // Search Sauda
        invoice = await Sauda.findOne({ _id: invoiceId, isDeleted: false });
        if (invoice) {
          resolvedType = 'Sauda';
        }
      }
    }

    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice/Sauda not found.' });
    }

    const totalAmount = resolvedType === 'Sauda'
      ? parseFloat((invoice.rate * (invoice.quantity / 1000)).toFixed(2))
      : (invoice.totalAmount || 0);

    const pendingAmount = parseFloat((totalAmount - (invoice.paidAmount || 0)).toFixed(2));
    if (amount > pendingAmount) {
      return res.status(400).json({ success: false, message: `Amount exceeds pending balance. Pending is ${pendingAmount}.` });
    }

    // 3. Create PaymentAllocation
    await PaymentAllocation.create({
      paymentId,
      invoiceId,
      invoiceType: resolvedType,
      amount,
      createdBy: req.user._id
    });

    // 4. Deduct advance from Payment
    payment.advanceRemaining = parseFloat((payment.advanceRemaining - amount).toFixed(2));
    await payment.save();

    // 5. Add paidAmount to Invoice & update paymentStatus
    invoice.paidAmount = parseFloat(((invoice.paidAmount || 0) + amount).toFixed(2));
    const newPending = parseFloat((totalAmount - invoice.paidAmount).toFixed(2));
    if (newPending <= 0) {
      invoice.paymentStatus = 'paid';
    } else if (invoice.paidAmount > 0) {
      invoice.paymentStatus = 'partial';
    } else {
      invoice.paymentStatus = 'unpaid';
    }
    await invoice.save();

    res.status(200).json({
      success: true,
      message: 'Advance settled successfully.'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error settling advance',
      error: error.message
    });
  }
};

module.exports = {
  getOutstanding,
  getPendingInvoices,
  getAdvances,
  settleAdvance
};
