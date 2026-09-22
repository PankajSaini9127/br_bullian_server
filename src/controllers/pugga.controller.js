const Pugga = require('../models/Pugga.model');
const SalesInvoice = require('../models/SalesInvoice.model');
const Invoice = require('../models/Invoice.model');
const MetalBadla = require('../models/MetalBadla.model');
const { roundToHalf } = require('../utils/rounding.util');

const createPugga = async (req, res) => {
  try {
    const { puggaNo, weight, touch, remark, invoiceId } = req.body;

    if (!puggaNo || !weight || !touch || !invoiceId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Pugga no, weight, touch, and invoice id are required' 
      });
    }

    const pugga = await Pugga.create({
      puggaNo,
      weight,
      touch,
      remark,
      invoiceId,
      createdBy: req.user._id
    });

    res.status(201).json({
      success: true,
      message: 'Pugga created successfully',
      data: { pugga }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error creating pugga', 
      error: error.message 
    });
  }
};

const getAllPuggas = async (req, res) => {
  try {
    const { invoiceId, search, page = 1, limit = 10 } = req.query;
    const filter = {     };
    if (invoiceId) {
      filter.invoiceId = invoiceId;
    }

    if (search) {
      const searchNum = Number(search);
      filter.$or = [
        { paggaNo: { $regex: search, $options: 'i' } },
        { weight: isNaN(searchNum) ? undefined : searchNum },
        { touch: isNaN(searchNum) ? undefined : searchNum },
      ].filter(c => Object.values(c)[0] !== undefined);

      // Fine search: weight * touch / 100
      if (!isNaN(searchNum)) {
        filter.$or.push({
          $expr: {
            $eq: [{ $divide: [{ $multiply: ['$weight', '$touch'] }, 100] }, searchNum]
          }
        });
      }
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const puggas = await Pugga.find(filter)
      .populate({
        path: 'invoiceId',
        select: 'invoiceNo invoiceDate partyId',
        populate: { path: 'partyId', select: 'partyName' }
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await Pugga.countDocuments(filter);

    // Find sales invoice party for sold puggas
    const soldPuggaIds = puggas.filter(p => p.isSold).map(p => p._id);
    let salesInvoiceMap = {};
    if (soldPuggaIds.length > 0) {
      const salesInvoices = await SalesInvoice.find({
        paggaIds: { $in: soldPuggaIds },
        isDeleted: false
      }).populate('partyId', 'partyName');

      for (const si of salesInvoices) {
        for (const pid of si.paggaIds) {
          salesInvoiceMap[pid.toString()] = si.partyId ? si.partyId.partyName : 'Unknown';
        }
      }
    }

    const puggasWithParties = puggas.map(p => {
      const obj = p.toObject();
      obj.boughtFrom = obj.invoiceId && obj.invoiceId.partyId ? obj.invoiceId.partyId.partyName : 'Unknown';
      obj.soldTo = p.isSold ? (salesInvoiceMap[p._id.toString()] || 'Unknown') : null;
      obj.fine = (Number(p.weight) * Number(p.touch)) / 100;
      return obj;
    });

    res.status(200).json({
      success: true,
      data: {
        puggas: puggasWithParties,
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
      message: 'Error fetching puggas', 
      error: error.message 
    });
  }
};

const getPuggaById = async (req, res) => {
  try {
    const pugga = await Pugga.findOne({ _id: req.params.id,   });
    
    if (!pugga) {
      return res.status(404).json({ 
        success: false, 
        message: 'Pugga not found' 
      });
    }

    res.status(200).json({
      success: true,
      data: { pugga }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching pugga', 
      error: error.message 
    });
  }
};

const updatePugga = async (req, res) => {
  try {
    const { puggaNo, weight, touch, remark, isActive } = req.body;

    const pugga = await Pugga.findByIdAndUpdate(
      req.params.id,
      { puggaNo, weight, touch, remark, isActive, updatedBy: req.user._id },
      { new: true, runValidators: true }
    );

    if (!pugga) {
      return res.status(404).json({ 
        success: false, 
        message: 'Pugga not found' 
      });
    }

    res.status(200).json({
      success: true,
      message: 'Pugga updated successfully',
      data: { pugga }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error updating pugga', 
      error: error.message 
    });
  }
};

const deletePugga = async (req, res) => {
  try {
    const pugga = await Pugga.findByIdAndUpdate(
      req.params.id,
      { isDeleted: true, deletedBy: req.user._id },
      { new: true }
    );

    if (!pugga) {
      return res.status(404).json({ 
        success: false, 
        message: 'Pugga not found' 
      });
    }

    res.status(200).json({
      success: true,
      message: 'Pugga deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error deleting pugga', 
      error: error.message 
    });
  }
};

const getPuggasForSale = async (req, res) => {
  try {
    const { invoiceId, isReturn, partyId } = req.query;
    let filter = { isSold: false, isDukanStock: false, isPurchaseReturn: false, invoiceId: { $exists: true, $ne: null } };

    // If isReturn is true, show puggas sold to the specified party that are not returned
    if (isReturn === 'true' && partyId) {
      // Find sales invoices for this party
      const salesInvoices = await SalesInvoice.find({
        partyId,
        isDeleted: false
      });

      // Get all pugga IDs from these sales invoices
      const soldPuggaIds = salesInvoices.flatMap(si => si.paggaIds);

      // Filter for puggas that are sold to this party and not returned
      filter = {
        _id: { $in: soldPuggaIds },
        isSold: true,
        isReturned: false
      };
    } else if (invoiceId) {
      filter.invoiceId = invoiceId;
    }

    const puggas = await Pugga.find(filter)
      .populate({
        path: 'invoiceId',
        select: 'invoiceNo invoiceDate partyId',
        populate: { path: 'partyId', select: 'partyName' }
      })
      .sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      data: { puggas }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching puggas for sale',
      error: error.message
    });
  }
};
const getPuggasByParty = async (req, res) => {
  try {
    const { partyId } = req.params;

    if (!partyId) {
      return res.status(400).json({
        success: false,
        message: 'Party ID is required'
      });
    }

    // Find all invoices for this party
    const invoices = await Invoice.find({
      partyId,
      isDeleted: false
    });

    const invoiceIds = invoices.map(inv => inv._id);

    // Build filter - only unsold puggas and not purchase returns
    const filter = {
      invoiceId: { $in: invoiceIds },
      isSold: false,
      isPurchaseReturn: false,
      isDeleted: false
    };

    const puggas = await Pugga.find(filter)
      .populate({
        path: 'invoiceId',
        select: 'invoiceNo invoiceDate partyId',
        populate: { path: 'partyId', select: 'partyName' }
      })
      .sort({ createdAt: -1 });

    // Add fine calculation
    const puggasWithFine = puggas.map(p => {
      const obj = p.toObject();
      obj.fine = roundToHalf((Number(p.weight) * Number(p.touch)) / 100);
      return obj;
    });

    res.status(200).json({
      success: true,
      data: { puggas: puggasWithFine }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching puggas by party',
      error: error.message
    });
  }
};


const getKachiStockReport = async (req, res) => {
  try {
    const { date } = req.query;
    const endOfDate = date ? new Date(date) : new Date();
    endOfDate.setHours(23, 59, 59, 999);

    // Invoices (Purchase Kachi)
    const purchases = await Invoice.find({ isDeleted: false, isReturn: false, invoiceDate: { $lte: endOfDate } })
      .populate('partyId', 'partyName')
      .select('_id invoiceNo invoiceDate partyId')
      .lean();
    const purchaseMap = {};
    purchases.forEach(p => {
      purchaseMap[p._id.toString()] = p;
    });
    const purchaseIds = purchases.map(p => p._id);

    // Metal Badlas (Exchange Kachi)
    const badlas = await MetalBadla.find({ isDeleted: false, date: { $lte: endOfDate } })
      .populate('partyId', 'partyName')
      .select('_id badlaNo date partyId paggaIds')
      .lean();
    const badlaMap = {};
    const badlaPuggaIds = [];
    badlas.forEach(b => {
      (b.paggaIds || []).forEach(pid => {
        badlaPuggaIds.push(pid);
        badlaMap[pid.toString()] = b;
      });
    });

    // Created puggas
    const createdPuggas = await Pugga.find({
      isDeleted: false,
      $or: [
        { invoiceId: { $in: purchaseIds } },
        { _id: { $in: badlaPuggaIds } }
      ]
    }).lean();

    // Sold puggas (Sales Kachi)
    const salesInvoices = await SalesInvoice.find({ isDeleted: false, isReturn: false, invoiceDate: { $lte: endOfDate } }).select('paggaIds').lean();
    const soldPuggaIds = new Set(salesInvoices.reduce((acc, s) => acc.concat((s.paggaIds || []).map(id => id.toString())), []));

    // Remaining puggas in stock
    const remainingPuggas = createdPuggas.filter(p => !soldPuggaIds.has(p._id.toString()));

    const puggasWithDetails = remainingPuggas.map(p => {
      const weight = Number(p.weight) || 0;
      const touch = Number(p.touch) || 0;
      const fine = roundToHalf((weight * touch) / 100);

      let source = 'Direct';
      let sourceNo = '-';
      let partyName = 'Unknown';
      let recordDate = p.createdAt;

      if (p.invoiceId && purchaseMap[p.invoiceId.toString()]) {
        const inv = purchaseMap[p.invoiceId.toString()];
        source = 'Purchase';
        sourceNo = inv.invoiceNo || '-';
        partyName = inv.partyId?.partyName || 'Unknown';
        recordDate = inv.invoiceDate || p.createdAt;
      } else if (badlaMap[p._id.toString()]) {
        const mb = badlaMap[p._id.toString()];
        source = 'Exchange';
        sourceNo = mb.badlaNo || '-';
        partyName = mb.partyId?.partyName || 'Unknown';
        recordDate = mb.date || p.createdAt;
      }

      return {
        ...p,
        weight,
        touch,
        fine,
        source,
        sourceNo,
        boughtFrom: partyName,
        date: recordDate
      };
    });

    // Sort newest first
    puggasWithDetails.sort((a, b) => new Date(b.date) - new Date(a.date));

    const totalWeight = puggasWithDetails.reduce((sum, p) => sum + p.weight, 0);
    const totalFine = puggasWithDetails.reduce((sum, p) => sum + p.fine, 0);

    res.status(200).json({
      success: true,
      data: {
        totalPuggas: puggasWithDetails.length,
        totalWeight,
        totalFine,
        puggas: puggasWithDetails
      }
    });
  } catch (error) {
    console.error('Error fetching kachi stock report:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching kachi stock report',
      error: error.message
    });
  }
};

module.exports = {
  createPugga,
  getAllPuggas,
  getPuggaById,
  updatePugga,
  deletePugga,
  getPuggasForSale,
  getPuggasByParty,
  getKachiStockReport
};
