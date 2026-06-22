const Pugga = require('../models/Pugga.model');
const SalesInvoice = require('../models/SalesInvoice.model');

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
    let filter = { isSold: false, isDukanStock: false, invoiceId: { $exists: true, $ne: null } };

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

module.exports = {
  createPugga,
  getAllPuggas,
  getPuggaById,
  updatePugga,
  deletePugga,
  getPuggasForSale
};
