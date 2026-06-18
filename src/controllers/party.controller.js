const Party = require('../models/Party.model');
const Invoice = require('../models/Invoice.model');
const Pugga = require('../models/Pugga.model');
const SalesInvoice = require('../models/SalesInvoice.model');
const InvoiceSauda = require('../models/InvoiceSauda.model');
const Sauda = require('../models/Sauda.model');
const SaudaCrosscut = require('../models/SaudaCrosscut.model');
const Payment = require('../models/Payment.model');

const createParty = async (req, res) => {
  try {
    const { partyName, contactNo, address, email, gstin, openingBalance } = req.body;

    if (!partyName || !contactNo) {
      return res.status(400).json({ 
        success: false, 
        message: 'Party name and contact number are required' 
      });
    }

    const party = await Party.create({
      partyName,
      contactNo,
      address,
      email,
      gstin,
      openingBalance: openingBalance || 0,
      createdBy: req.user._id
    });

    res.status(201).json({
      success: true,
      message: 'Party created successfully',
      data: { party }
    });
  } catch (error) {
    console.error('Create Party Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creating party', 
      error: error.message 
    });
  }
};

const getPartyDropdown = async (req, res) => {
  try {
    const { search } = req.query;
    const filter = { isDeleted: false };

    if (search) {
      filter.$or = [
        { partyName: { $regex: search, $options: 'i' } },
        { contactNo: { $regex: search, $options: 'i' } }
      ];
    }

    const parties = await Party.find(filter)
      .select('_id partyName')
      .sort({ partyName: 1 })
      .limit(10);

    res.status(200).json({
      success: true,
      data: { parties }
    });
  } catch (error) {
    console.error('Get Party Dropdown Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching parties',
      error: error.message
    });
  }
};

const getAllParties = async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;
    const filter = { isDeleted: false };

    if (search) {
      filter.$or = [
        { partyName: { $regex: search, $options: 'i' } },
        { contactNo: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { gstin: { $regex: search, $options: 'i' } }
      ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;


    const [parties, total] = await Promise.all([
      Party.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      Party.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      data: {
        parties,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalItems: total,
          itemsPerPage: limitNum
        }
      }
    });
  } catch (error) {
    console.error('Get All Parties Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching parties', 
      error: error.message 
    });
  }
};

const getPartyById = async (req, res) => {
  try {
    const party = await Party.findOne({ _id: req.params.id,   });
    
    if (!party) {
      return res.status(404).json({ 
        success: false, 
        message: 'Party not found' 
      });
    }

    res.status(200).json({
      success: true,
      data: { party }
    });
  } catch (error) {
    console.error('Get Party By ID Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching party', 
      error: error.message 
    });
  }
};

const updateParty = async (req, res) => {
  try {
    const { partyName, contactNo, address, email, gstin, isActive, openingBalance } = req.body;


    const party = await Party.findByIdAndUpdate(
      req.params.id,
      { partyName, contactNo, address, email, gstin, isActive, openingBalance, updatedBy: req.user._id },
      { new: true, runValidators: true }
    );

    if (!party) {
      return res.status(404).json({ 
        success: false, 
        message: 'Party not found' 
      });
    }

    res.status(200).json({
      success: true,
      message: 'Party updated successfully',
      data: { party }
    });
  } catch (error) {
    console.error('Update Party Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating party', 
      error: error.message 
    });
  }
};

const deleteParty = async (req, res) => {
  try {
    const party = await Party.findByIdAndUpdate(
      req.params.id,
      { isDeleted: true, deletedBy: req.user._id },
      { new: true }
    );

    if (!party) {
      return res.status(404).json({ 
        success: false, 
        message: 'Party not found' 
      });
    }

    res.status(200).json({
      success: true,
      message: 'Party deleted successfully'
    });
  } catch (error) {
    console.error('Delete Party Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error deleting party', 
      error: error.message 
    });
  }
};

const getPartyLedger = async (req, res) => {
  try {
    const { partyId } = req.params;
    const { startDate, endDate } = req.query;

    const party = await Party.findOne({ _id: partyId, isDeleted: false });
    if (!party) {
      return res.status(404).json({ success: false, message: 'Party not found' });
    }

    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.$gte = new Date(startDate);
      dateFilter.$lte = new Date(endDate);
    }

    const invoiceFilter = { partyId, isDeleted: false };
    const salesFilter = { partyId, isDeleted: false };
    const paymentFilter = { partyId, isDeleted: false };
    if (startDate && endDate) {
      invoiceFilter.invoiceDate = dateFilter;
      salesFilter.invoiceDate = dateFilter;
      paymentFilter.paymentDate = dateFilter;
    }

    // Fetch incoming invoices
    const incomingInvoices = await Invoice.find(invoiceFilter).sort({ createdAt: -1 });
    const incomingInvoiceIds = incomingInvoices.map(inv => inv._id);

    // Fetch sauda cuts for these invoices
    const invoiceSaudaCuts = await InvoiceSauda.find({ invoiceId: { $in: incomingInvoiceIds }, isDeleted: false })
      .populate('saudaId', 'saudaNo saudaDate quantity delivered rate status isBhavCut');

    const saudaCutsByInvoice = {};
    invoiceSaudaCuts.forEach(cut => {
      const key = cut.invoiceId.toString();
      if (!saudaCutsByInvoice[key]) saudaCutsByInvoice[key] = [];
      saudaCutsByInvoice[key].push({
        saudaId: cut.saudaId._id,
        saudaNo: cut.saudaId.saudaNo,
        saudaDate: cut.saudaId.saudaDate,
        quantity: cut.saudaId.quantity,
        delivered: cut.saudaId.delivered,
        rate: cut.saudaId.rate,
        status: cut.saudaId.status,
        cutWeight: cut.weight,
        cutFine: cut.fine,
        isBhavCut: cut.saudaId.isBhavCut
      });
    });

    // Fetch sales invoices
    const salesInvoices = await SalesInvoice.find(salesFilter)
      .populate('paggaIds', 'weight touch')
      .sort({ createdAt: -1 });
    const salesInvoiceIds = salesInvoices.map(si => si._id);

    // Fetch sauda cuts for sales invoices
    const salesSaudaCuts = await InvoiceSauda.find({ invoiceId: { $in: salesInvoiceIds }, isDeleted: false })
      .populate('saudaId', 'saudaNo saudaDate quantity delivered rate status isBhavCut');

    const salesSaudaCutsByInvoice = {};
    salesSaudaCuts.forEach(cut => {
      const key = cut.invoiceId.toString();
      if (!salesSaudaCutsByInvoice[key]) salesSaudaCutsByInvoice[key] = [];
      salesSaudaCutsByInvoice[key].push({
        saudaId: cut.saudaId._id,
        saudaNo: cut.saudaId.saudaNo,
        saudaDate: cut.saudaId.saudaDate,
        quantity: cut.saudaId.quantity,
        delivered: cut.saudaId.delivered,
        rate: cut.saudaId.rate,
        status: cut.saudaId.status,
        cutWeight: cut.weight,
        cutFine: cut.fine,
        isBhavCut: cut.saudaId.isBhavCut
      });
    });

    // Build ledger entries
    const entries = [];

    for (const inv of incomingInvoices) {
      const cuts = saudaCutsByInvoice[inv._id.toString()] || [];
      const totalWeight = cuts.reduce((s, c) => s + (c.cutWeight || 0), 0);
      const totalFine = cuts.reduce((s, c) => s + (c.cutFine || 0), 0);
      entries.push({
        date: inv.invoiceDate,
        createdAt: inv.createdAt,
        type: 'incoming',
        invoiceNo: inv.invoiceNo,
        totalWeight,
        totalFine,
        saudaCuts: cuts
      });
    }

    for (const si of salesInvoices) {
      const cuts = salesSaudaCutsByInvoice[si._id.toString()] || [];
      const puggas = si.paggaIds || [];
      const totalWeight = cuts.reduce((s, c) => s + (c.cutWeight || 0), 0);
      const totalFine = cuts.reduce((s, c) => s + (c.cutFine || 0), 0);
      entries.push({
        date: si.invoiceDate,
        createdAt: si.createdAt,
        type: 'sales',
        invoiceNo: si.salesInvoiceNo,
        totalWeight,
        totalFine,
        saudaCuts: cuts,
        puggaCount: puggas.length
      });
    }

    // Fetch payments
    const payments = await Payment.find(paymentFilter)
      .sort({ createdAt: -1 });

    for (const payment of payments) {
      entries.push({
        date: payment.paymentDate,
        createdAt: payment.createdAt,
        type: 'payment',
        paymentType: payment.paymentType,
        paymentNo: payment.paymentNo,
        amount: payment.amount,
        paymentMode: payment.paymentMode,
        remark: payment.remark
      });
    }

    // Sort all entries by createdAt ascending (oldest first)
    entries.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    // Totals
    const totalIncomingWeight = entries.filter(e => e.type === 'incoming').reduce((s, e) => s + e.totalWeight, 0);
    const totalIncomingFine = entries.filter(e => e.type === 'incoming').reduce((s, e) => s + e.totalFine, 0);
    const totalSalesWeight = entries.filter(e => e.type === 'sales').reduce((s, e) => s + e.totalWeight, 0);
    const totalSalesFine = entries.filter(e => e.type === 'sales').reduce((s, e) => s + e.totalFine, 0);
    const totalIncomingPayment = entries.filter(e => e.type === 'payment' && e.paymentType === 'incoming').reduce((s, e) => s + (e.amount || 0), 0);
    const totalOutgoingPayment = entries.filter(e => e.type === 'payment' && e.paymentType === 'outgoing').reduce((s, e) => s + (e.amount || 0), 0);

    // Pending saudas for this party
    const pendingSaudas = await Sauda.find({
      partyId,
      status: { $in: ['pending', 'partial'] },
      isDeleted: false
    }).sort({ saudaDate: -1 });

    // Fetch cross cut records for this party
    const crosscutFilter = { isDeleted: false };
    if (startDate && endDate) {
      crosscutFilter.crosscutDate = dateFilter;
    }

    // Get all saudas for this party
    const partySaudas = await Sauda.find({ partyId, isDeleted: false });
    const partySaudaIds = partySaudas.map(s => s._id);

    // Fetch cross cuts where source or target sauda belongs to this party
    const crossCuts = await SaudaCrosscut.find({
      $or: [
        { sourceSaudaId: { $in: partySaudaIds } },
        { targetSaudaId: { $in: partySaudaIds } }
      ],
      ...crosscutFilter
    }).populate('sourceSaudaId', 'saudaNo saudaType partyId')
      .populate('targetSaudaId', 'saudaNo saudaType partyId')
      .sort({ crosscutDate: -1 });

    // Add cross cut entries to ledger
    // Group cross cuts by target sauda (purchase) to combine all crossed sales saudas into one entry
    const crossCutsByTarget = {};
    for (const crossCut of crossCuts) {
      const targetSaudaId = crossCut.targetSaudaId._id.toString();
      if (!crossCutsByTarget[targetSaudaId]) {
        crossCutsByTarget[targetSaudaId] = {
          date: crossCut.crosscutDate,
          createdAt: crossCut.createdAt,
          targetSaudaNo: crossCut.targetSaudaId.saudaNo,
          targetSaudaType: crossCut.targetSaudaId.saudaType,
          details: [],
          dates: [crossCut.crosscutDate]
        };
      } else {
        // Track all dates for this target sauda
        if (!crossCutsByTarget[targetSaudaId].dates.includes(crossCut.crosscutDate)) {
          crossCutsByTarget[targetSaudaId].dates.push(crossCut.crosscutDate);
        }
        // Use the most recent createdAt for sorting
        if (new Date(crossCut.createdAt) > new Date(crossCutsByTarget[targetSaudaId].createdAt)) {
          crossCutsByTarget[targetSaudaId].createdAt = crossCut.createdAt;
        }
      }
      crossCutsByTarget[targetSaudaId].details.push({
        sourceSaudaNo: crossCut.sourceSaudaId.saudaNo,
        sourceSaudaType: crossCut.sourceSaudaId.saudaType,
        crosscutQuantity: crossCut.crosscutQuantity,
        sourceRate: crossCut.sourceRate,
        targetRate: crossCut.targetRate,
        profitLoss: crossCut.profitLoss,
        creditDebitType: crossCut.creditDebitType,
        amount: crossCut.amount,
        crosscutDate: crossCut.crosscutDate
      });
    }

    // Add grouped cross cut entries to ledger
    for (const targetSaudaId in crossCutsByTarget) {
      const group = crossCutsByTarget[targetSaudaId];
      const totalProfitLoss = group.details.reduce((sum, d) => sum + d.profitLoss, 0);
      // Sort dates to get min and max
      const sortedDates = group.dates.sort((a, b) => new Date(a) - new Date(b));
      entries.push({
        date: sortedDates[0], // Use earliest date as main date
        createdAt: group.createdAt,
        type: 'crosscut',
        targetSaudaNo: group.targetSaudaNo,
        targetSaudaType: group.targetSaudaType,
        totalProfitLoss,
        creditDebitType: totalProfitLoss >= 0 ? 'credit' : 'debit',
        totalAmount: Math.abs(totalProfitLoss),
        details: group.details,
        dates: group.dates // Include all dates for reference
      });
    }

    // Sort all entries by createdAt ascending (oldest first)
    entries.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    res.status(200).json({
      success: true,
      data: {
        party: { _id: party._id, partyName: party.partyName, contactNo: party.contactNo, openingBalance: party.openingBalance || 0 },
        entries,
        summary: {
          totalIncomingWeight,
          totalIncomingFine,
          totalSalesWeight,
          totalSalesFine,
          balanceWeight: totalIncomingWeight - totalSalesWeight,
          balanceFine: totalIncomingFine - totalSalesFine,
          totalIncomingPayment,
          totalOutgoingPayment,
          balancePayment: totalIncomingPayment - totalOutgoingPayment
        },
        pendingSaudas
      }
    });
  } catch (error) {
    console.error('Get Party Ledger Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching party ledger', 
      error: error.message 
    });
  }
};

module.exports = {
  createParty,
  getPartyDropdown,
  getAllParties,
  getPartyById,
  updateParty,
  deleteParty,
  getPartyLedger
};
