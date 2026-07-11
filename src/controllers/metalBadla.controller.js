const MetalBadla = require('../models/MetalBadla.model');
const Pugga = require('../models/Pugga.model');
const Sauda = require('../models/Sauda.model');
const Invoice = require('../models/Invoice.model');
const { generateSaudaNo } = require('../utils/saudaGenerator');
const { generateInvoiceNo } = require('../utils/invoiceGenerator');
const { roundToHalf } = require('../utils/rounding.util');

const generateBadlaNo = async () => {
  try {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    const lastBadla = await MetalBadla.findOne({
      badlaNo: new RegExp(`^BADLA-${year}-${month}-${day}`)
    }).sort({ badlaNo: -1 });

    let sequence = 1;
    if (lastBadla) {
      const lastSequence = parseInt(lastBadla.badlaNo.split('-')[4]);
      sequence = lastSequence + 1;
    }

    return `BADLA-${year}-${month}-${day}-${String(sequence).padStart(4, '0')}`;
  } catch (error) {
    console.error('Error generating badla number:', error);
    return `BADLA-${Date.now()}`;
  }
};

const createMetalBadla = async (req, res) => {
  try {
    const {
      partyId,
      date,
      items,
      totalFine,
      paltaPerKg,
      requiredSilver,
      chandiDeniHai,
      givenSilver,
      silverDifference,
      silverRate,
      transactionType,
      finalAmount,
      remark,
      saudaCategory
    } = req.body;

    if (!partyId || !date) {
      return res.status(400).json({
        success: false,
        message: 'Party id and date are required'
      });
    }

    const hasBhavCut = silverDifference !== undefined && silverDifference !== null && Number(silverDifference) !== 0 && silverRate;
    const hasItems = items && Array.isArray(items) && items.length > 0;

    const [badlaNo, saudaNo, invoiceNo] = await Promise.all([
      generateBadlaNo(),
      hasBhavCut ? generateSaudaNo() : Promise.resolve(null),
      hasItems ? generateInvoiceNo() : Promise.resolve(null)
    ]);

    const metalBadla = await MetalBadla.create({
      badlaNo,
      partyId,
      date,
      totalFine: totalFine || 0,
      paltaPerKg: paltaPerKg || 0,
      requiredSilver: requiredSilver || 0,
      chandiDeniHai: chandiDeniHai || 0,
      givenSilver: givenSilver || 0,
      silverDifference: silverDifference || 0,
      silverRate: silverRate || 0,
      transactionType: transactionType || 'sales',
      finalAmount: finalAmount || 0,
      remark,
      createdBy: req.user._id
    });

    let createdPuggas = [];
    let createdInvoice = null;

    if (hasItems) {
      createdInvoice = await Invoice.create({
        invoiceNo,
        partyId,
        invoiceDate: date,
        totalAmount: finalAmount || 0,
        isReturn: false,
        isMetalPalta: true,
        createdBy: req.user._id
      });

      const puggaData = items.map(item => ({
        paggaNo: item.paggaNo,
        weight: item.weight,
        touch: item.touch,
        remark: item.remark,
        invoiceId: createdInvoice._id,
        isDukanStock: false,
        createdBy: req.user._id
      }));
      createdPuggas = await Pugga.insertMany(puggaData);

      const paggaIds = createdPuggas.map(p => p._id);
      metalBadla.paggaIds = paggaIds;
      metalBadla.invoiceId = createdInvoice._id;
      await metalBadla.save();
    }

    // Create sauda if bhav cut (silver difference) exists
    let bhavCutSauda = null;
    if (hasBhavCut) {
      bhavCutSauda = await Sauda.create({
        saudaNo,
        partyId,
        saudaDate: date,
        quantity: Math.abs(silverDifference),
        delivered: Math.abs(silverDifference),
        rate: silverRate,
        saudaType: transactionType || 'sales',
        saudaCategory: saudaCategory || 'kachi',
        isBhavCut: true,
        status: 'delivered',
        createdBy: req.user._id
      });
      metalBadla.bhavCutSaudaId = bhavCutSauda._id;
      await metalBadla.save();
    }

    const badlaObj = metalBadla.toObject();
    badlaObj.items = createdPuggas;
    badlaObj.bhavCutSauda = bhavCutSauda;
    badlaObj.invoice = createdInvoice;

    res.status(201).json({
      success: true,
      message: 'Metal badla created successfully',
      data: { metalBadla: badlaObj }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating metal badla',
      error: error.message
    });
  }
};

const getAllMetalBadla = async (req, res) => {
  try {
    const { partyId, startDate, endDate, page = 1, limit = 10 } = req.query;
    const filter = { isDeleted: false };

    if (partyId) filter.partyId = partyId;
    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const records = await MetalBadla.find(filter)
      .populate('partyId', 'partyName contactNo address email gstin')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await MetalBadla.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        records,
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
      message: 'Error fetching metal badla records',
      error: error.message
    });
  }
};

const getMetalBadlaById = async (req, res) => {
  try {
    const record = await MetalBadla.findOne({ _id: req.params.id, isDeleted: false })
      .populate('partyId', 'partyName contactNo address email gstin')
      .populate('paggaIds');

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Metal badla not found'
      });
    }

    res.status(200).json({
      success: true,
      data: { record }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching metal badla',
      error: error.message
    });
  }
};

const updateMetalBadla = async (req, res) => {
  try {
    const {
      partyId,
      date,
      items,
      totalFine,
      paltaPerKg,
      requiredSilver,
      chandiDeniHai,
      givenSilver,
      silverDifference,
      silverRate,
      transactionType,
      finalAmount,
      remark,
      isActive
    } = req.body;

    const existing = await MetalBadla.findOne({ _id: req.params.id, isDeleted: false });
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Metal badla not found'
      });
    }

    // Update puggas if provided
    if (items && Array.isArray(items)) {
      const existingPuggaIds = existing.paggaIds.map(id => id.toString());
      const providedPuggaIds = [];

      for (const item of items) {
        if (item._id) {
          providedPuggaIds.push(item._id.toString());
          await Pugga.findByIdAndUpdate(
            item._id,
            {
              paggaNo: item.paggaNo,
              weight: item.weight,
              touch: item.touch,
              remark: item.remark,
              updatedBy: req.user._id
            },
            { new: true, runValidators: true }
          );
        } else {
          const newPugga = await Pugga.create({
            paggaNo: item.paggaNo,
            weight: item.weight,
            touch: item.touch,
            remark: item.remark,
            isDukanStock: false,
            createdBy: req.user._id
          });
          providedPuggaIds.push(newPugga._id.toString());
        }
      }

      const puggasToDelete = existingPuggaIds.filter(id => !providedPuggaIds.includes(id));
      if (puggasToDelete.length > 0) {
        await Pugga.deleteMany({ _id: { $in: puggasToDelete } });
      }

      existing.paggaIds = providedPuggaIds;
    }

    existing.partyId = partyId || existing.partyId;
    existing.date = date || existing.date;
    existing.totalFine = totalFine !== undefined ? totalFine : existing.totalFine;
    existing.paltaPerKg = paltaPerKg !== undefined ? paltaPerKg : existing.paltaPerKg;
    existing.requiredSilver = requiredSilver !== undefined ? requiredSilver : existing.requiredSilver;
    existing.chandiDeniHai = chandiDeniHai !== undefined ? chandiDeniHai : existing.chandiDeniHai;
    existing.givenSilver = givenSilver !== undefined ? givenSilver : existing.givenSilver;
    existing.silverDifference = silverDifference !== undefined ? silverDifference : existing.silverDifference;
    existing.silverRate = silverRate !== undefined ? silverRate : existing.silverRate;
    existing.transactionType = transactionType || existing.transactionType;
    existing.finalAmount = finalAmount !== undefined ? finalAmount : existing.finalAmount;
    existing.remark = remark !== undefined ? remark : existing.remark;
    existing.isActive = isActive !== undefined ? isActive : existing.isActive;
    existing.updatedBy = req.user._id;
    await existing.save();

    res.status(200).json({
      success: true,
      message: 'Metal badla updated successfully',
      data: { record: existing }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating metal badla',
      error: error.message
    });
  }
};

const deleteMetalBadla = async (req, res) => {
  try {
    const record = await MetalBadla.findByIdAndUpdate(
      req.params.id,
      { isDeleted: true, deletedBy: req.user._id, deletedAt: new Date() },
      { new: true }
    );

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Metal badla not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Metal badla deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting metal badla',
      error: error.message
    });
  }
};

module.exports = {
  createMetalBadla,
  getAllMetalBadla,
  getMetalBadlaById,
  updateMetalBadla,
  deleteMetalBadla
};
