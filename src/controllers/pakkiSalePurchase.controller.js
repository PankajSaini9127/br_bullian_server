const PakkiSalePurchase = require('../models/PakkiSalePurchase.model');
const Sauda = require('../models/Sauda.model');
const InvoiceSauda = require('../models/InvoiceSauda.model');
const PhysicalStockVerification = require('../models/PhysicalStockVerification.model');
const CompanyProfile = require('../models/CompanyProfile.model');
const { generatePakkiPurchaseNo, generatePakkiSaleNo } = require('../utils/pakkiSalePurchaseGenerator');
const { generateSaudaNo } = require('../utils/saudaGenerator');

const calculateCurrentStock = async (userId, chorsaType, asOfDate) => {
  const endOfAsOfDate = asOfDate ? new Date(asOfDate) : null;
  if (endOfAsOfDate) endOfAsOfDate.setHours(23, 59, 59, 999);

  // 1. Get latest PhysicalStockVerification before or on asOfDate
  const verificationFilter = { isDeleted: false };
  if (endOfAsOfDate) {
    verificationFilter.date = { $lte: endOfAsOfDate };
  }
  const latestVerification = await PhysicalStockVerification.findOne(verificationFilter)
    .sort({ date: -1, createdAt: -1 })
    .lean();

  // 2. Get CompanyProfile
  const companyProfile = await CompanyProfile.findOne({ userId, isDeleted: false }).lean();

  // Default opening fine and dates
  const openingFineChorsa = companyProfile ? Number(companyProfile.openingFine) || 0 : 0;
  const openingFineBank = companyProfile ? Number(companyProfile.openingFine9999) || 0 : 0;

  const openingFineChorsaDate = companyProfile?.openingFineDate ? new Date(companyProfile.openingFineDate) : null;
  const openingFineBankDate = companyProfile?.openingFine9999Date ? new Date(companyProfile.openingFine9999Date) : null;

  // Determine start date and initial stock
  let initialStock = 0;
  let startDate = null;
  let isVerification = false;

  if (chorsaType === 'bank-9999') {
    if (latestVerification && latestVerification.bank9999 && latestVerification.bank9999.physicalWeight !== undefined && latestVerification.bank9999.physicalWeight !== null) {
      initialStock = Number(latestVerification.bank9999.physicalWeight);
      startDate = new Date(latestVerification.date);
      isVerification = true;
    } else {
      initialStock = openingFineBank;
      startDate = openingFineBankDate;
    }
  } else {
    if (latestVerification && latestVerification.chorsa999 && latestVerification.chorsa999.physicalWeight !== undefined && latestVerification.chorsa999.physicalWeight !== null) {
      initialStock = Number(latestVerification.chorsa999.physicalWeight);
      startDate = new Date(latestVerification.date);
      isVerification = true;
    } else {
      initialStock = openingFineChorsa;
      startDate = openingFineChorsaDate;
    }
  }

  // 3. Sum buy/sell transactions after start date and before/on endOfAsOfDate
  const filter = {
    chorsaType,
    isDeleted: false
  };
  
  if (startDate) {
    if (isVerification) {
      filter.$or = [
        { date: { $gt: startDate } },
        { date: startDate, createdAt: { $gt: latestVerification.createdAt } }
      ];
    } else {
      filter.date = { $gte: startDate };
    }
  }

  if (endOfAsOfDate) {
    if (filter.$or) {
      filter.$and = [
        { $or: filter.$or },
        { date: { $lte: endOfAsOfDate } }
      ];
      delete filter.$or;
    } else if (filter.date) {
      filter.date.$lte = endOfAsOfDate;
    } else {
      filter.date = { $lte: endOfAsOfDate };
    }
  }

  const txs = await PakkiSalePurchase.aggregate([
    { $match: filter },
    {
      $group: {
        _id: '$type',
        totalWeight: { $sum: '$weight' }
      }
    }
  ]);

  const buyWeight = txs.find(t => t._id === 'buy')?.totalWeight || 0;
  const sellWeight = txs.find(t => t._id === 'sell')?.totalWeight || 0;

  let metalBadlaDeduction = 0;
  if (chorsaType === 'chorsa-999') {
    const metalBadlaFilter = { isDeleted: false };
    if (startDate) {
      if (isVerification) {
        metalBadlaFilter.$or = [
          { date: { $gt: startDate } },
          { date: startDate, createdAt: { $gt: latestVerification.createdAt } }
        ];
      } else {
        metalBadlaFilter.date = { $gte: startDate };
      }
    }

    if (endOfAsOfDate) {
      if (metalBadlaFilter.$or) {
        metalBadlaFilter.$and = [
          { $or: metalBadlaFilter.$or },
          { date: { $lte: endOfAsOfDate } }
        ];
        delete metalBadlaFilter.$or;
      } else if (metalBadlaFilter.date) {
        metalBadlaFilter.date.$lte = endOfAsOfDate;
      } else {
        metalBadlaFilter.date = { $lte: endOfAsOfDate };
      }
    }

    const MetalBadla = require('../models/MetalBadla.model');
    const badlaAgg = await MetalBadla.aggregate([
      { $match: metalBadlaFilter },
      {
        $group: {
          _id: null,
          totalGiven: { $sum: '$givenSilver' }
        }
      }
    ]);
    metalBadlaDeduction = badlaAgg[0]?.totalGiven || 0;
  }

  return initialStock + buyWeight - sellWeight - metalBadlaDeduction;
};

const createPakkiSalePurchase = async (req, res) => {
  try {
    const { partyName, partyId, date, weight, pcs, type, chorsaType } = req.body;

    if (!partyId || !date || !type) {
      return res.status(400).json({
        success: false,
        message: 'Party id, date, and type are required'
      });
    }

    if (type === 'sell') {
      const [chorsaStock, bankStock] = await Promise.all([
        calculateCurrentStock(req.user._id, 'chorsa-999'),
        calculateCurrentStock(req.user._id, 'bank-9999')
      ]);
      const combinedStock = chorsaStock + bankStock;
      if ((weight || 0) > combinedStock) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock! Combined available stock of Chorsa 999 & Bank 9999 is ${combinedStock.toFixed(2)}g`
        });
      }
    }

    const invoiceNo = type === 'buy' ? await generatePakkiPurchaseNo() : await generatePakkiSaleNo();

    const record = await PakkiSalePurchase.create({
      invoiceNo,
      partyName,
      partyId,
      date,
      weight: weight || 0,
      pcs: pcs || 0,
      type,
      chorsaType: chorsaType || 'chorsa-999',
      createdBy: req.user._id
    });

    // Sauda cut distribution
    const targetSaudaType = type === 'buy' ? 'purchase' : 'sales';
    const targetSaudaCategory = chorsaType || 'chorsa-999';

    let bhavcutSauda = null;
    if (req.body.bhavcut && Number(req.body.bhavcut.weight) > 0) {
      const saudaNo = await generateSaudaNo();
      bhavcutSauda = await Sauda.create({
        saudaNo,
        partyId,
        saudaDate: req.body.bhavcut.date || date,
        quantity: req.body.bhavcut.weight,
        delivered: req.body.bhavcut.weight,
        rate: req.body.bhavcut.rate,
        saudaType: targetSaudaType,
        saudaCategory: targetSaudaCategory,
        isBhavCut: true,
        status: 'delivered',
        createdBy: req.user._id
      });
    }

    const saudas = await Sauda.find({
      partyId,
      saudaType: targetSaudaType,
      saudaCategory: targetSaudaCategory,
      status: { $in: ['pending', 'partial', 'cross'] },
      isDeleted: false
    }).sort({ saudaDate: 1 });

    let remainingWeight = (weight || 0) - (req.body.bhavcut ? Number(req.body.bhavcut.weight) || 0 : 0);
    const saudaUpdates = [];
    const invoiceSaudaRecords = [];

    if (bhavcutSauda) {
      invoiceSaudaRecords.push({
        invoiceId: record._id,
        saudaId: bhavcutSauda._id,
        weight: req.body.bhavcut.weight,
        fine: req.body.bhavcut.weight,
        createdBy: req.user._id
      });
    }

    for (const sauda of saudas) {
      if (remainingWeight <= 0) break;

      const saudaRemainingQty = Number(sauda.quantity) - Number(sauda.delivered) - (sauda.crossQuantity || 0);
      if (saudaRemainingQty <= 0) continue;

      const fineToUse = Math.min(remainingWeight, saudaRemainingQty);
      const newDelivered = Number(sauda.delivered) + fineToUse;
      const newStatus = (newDelivered + (sauda.crossQuantity || 0)) >= Number(sauda.quantity) ? 'delivered' : (sauda.crossQuantity > 0 ? 'cross' : 'partial');

      saudaUpdates.push({
        updateOne: {
          filter: { _id: sauda._id },
          update: { delivered: newDelivered, status: newStatus, updatedBy: req.user._id }
        }
      });

      invoiceSaudaRecords.push({
        invoiceId: record._id,
        saudaId: sauda._id,
        weight: fineToUse,
        fine: fineToUse,
        createdBy: req.user._id
      });

      remainingWeight -= fineToUse;
    }

    const writeOps = [];
    if (saudaUpdates.length > 0) writeOps.push(Sauda.bulkWrite(saudaUpdates));
    if (invoiceSaudaRecords.length > 0) writeOps.push(InvoiceSauda.insertMany(invoiceSaudaRecords));
    if (writeOps.length > 0) await Promise.all(writeOps);

    res.status(201).json({
      success: true,
      message: 'Pakki sale purchase created successfully',
      data: { record }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating pakki sale purchase',
      error: error.message
    });
  }
};

const getAllPakkiSalePurchase = async (req, res) => {
  try {
    const { partyId, type, chorsaType, startDate, endDate, page = 1, limit = 10 } = req.query;
    const filter = { isDeleted: false };

    if (partyId) filter.partyId = partyId;
    if (type) filter.type = type;
    if (chorsaType) filter.chorsaType = chorsaType;
    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const records = await PakkiSalePurchase.find(filter)
      .populate('partyId', 'partyName contactNo address email gstin')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await PakkiSalePurchase.countDocuments(filter);

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
      message: 'Error fetching pakki sale purchase records',
      error: error.message
    });
  }
};

const getPakkiSalePurchaseById = async (req, res) => {
  try {
    const record = await PakkiSalePurchase.findOne({ _id: req.params.id, isDeleted: false })
      .populate('partyId', 'partyName contactNo address email gstin');

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Record not found'
      });
    }

    res.status(200).json({
      success: true,
      data: { record }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching record',
      error: error.message
    });
  }
};

const updatePakkiSalePurchase = async (req, res) => {
  try {
    const { partyName, partyId, date, weight, pcs, type, chorsaType, isActive } = req.body;

    const existingRecord = await PakkiSalePurchase.findById(req.params.id);
    if (!existingRecord) {
      return res.status(404).json({
        success: false,
        message: 'Record not found'
      });
    }

    if (type === 'sell') {
      const [chorsaStock, bankStock] = await Promise.all([
        calculateCurrentStock(req.user._id, 'chorsa-999'),
        calculateCurrentStock(req.user._id, 'bank-9999')
      ]);
      const combinedStock = chorsaStock + bankStock;

      const existingWeight = Number(existingRecord.weight) || 0;
      let availableStock = combinedStock;
      if (existingRecord.chorsaType === 'chorsa-999' || existingRecord.chorsaType === 'bank-9999') {
        availableStock = combinedStock + (existingRecord.type === 'sell' ? existingWeight : 0) - (existingRecord.type === 'buy' ? existingWeight : 0);
      }

      if ((weight || 0) > availableStock) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock! Combined available stock of Chorsa 999 & Bank 9999 is ${availableStock.toFixed(2)}g`
        });
      }
    }

    // Revert old sauda distributions
    const oldInvoiceSaudas = await InvoiceSauda.find({ invoiceId: existingRecord._id });
    for (const is of oldInvoiceSaudas) {
      const sauda = await Sauda.findById(is.saudaId);
      if (sauda) {
        const newDelivered = Math.max(0, Number(sauda.delivered) - is.weight);
        const newStatus = newDelivered <= 0 ? (sauda.crossQuantity > 0 ? 'cross' : 'pending') : ((newDelivered + (sauda.crossQuantity || 0)) >= Number(sauda.quantity) ? 'delivered' : (sauda.crossQuantity > 0 ? 'cross' : 'partial'));
        await Sauda.findByIdAndUpdate(is.saudaId, { delivered: newDelivered, status: newStatus });
      }
    }
    await InvoiceSauda.deleteMany({ invoiceId: existingRecord._id });

    const record = await PakkiSalePurchase.findByIdAndUpdate(
      req.params.id,
      { partyName, partyId, date, weight, pcs, type, chorsaType, isActive, updatedBy: req.user._id },
      { new: true, runValidators: true }
    );

    // Apply new sauda cuts
    const targetSaudaType = record.type === 'buy' ? 'purchase' : 'sales';
    const targetSaudaCategory = record.chorsaType || 'chorsa-999';

    let bhavcutSauda = null;
    if (req.body.bhavcut && Number(req.body.bhavcut.weight) > 0) {
      const saudaNo = await generateSaudaNo();
      bhavcutSauda = await Sauda.create({
        saudaNo,
        partyId: record.partyId,
        saudaDate: req.body.bhavcut.date || record.date,
        quantity: req.body.bhavcut.weight,
        delivered: req.body.bhavcut.weight,
        rate: req.body.bhavcut.rate,
        saudaType: targetSaudaType,
        saudaCategory: targetSaudaCategory,
        isBhavCut: true,
        status: 'delivered',
        createdBy: req.user._id
      });
    }

    const saudas = await Sauda.find({
      partyId: record.partyId,
      saudaType: targetSaudaType,
      saudaCategory: targetSaudaCategory,
      status: { $in: ['pending', 'partial', 'cross'] },
      isDeleted: false
    }).sort({ saudaDate: 1 });

    let remainingWeight = (record.weight || 0) - (req.body.bhavcut ? Number(req.body.bhavcut.weight) || 0 : 0);
    const saudaUpdates = [];
    const invoiceSaudaRecords = [];

    if (bhavcutSauda) {
      invoiceSaudaRecords.push({
        invoiceId: record._id,
        saudaId: bhavcutSauda._id,
        weight: req.body.bhavcut.weight,
        fine: req.body.bhavcut.weight,
        createdBy: req.user._id
      });
    }

    for (const sauda of saudas) {
      if (remainingWeight <= 0) break;

      const saudaRemainingQty = Number(sauda.quantity) - Number(sauda.delivered) - (sauda.crossQuantity || 0);
      if (saudaRemainingQty <= 0) continue;

      const fineToUse = Math.min(remainingWeight, saudaRemainingQty);
      const newDelivered = Number(sauda.delivered) + fineToUse;
      const newStatus = (newDelivered + (sauda.crossQuantity || 0)) >= Number(sauda.quantity) ? 'delivered' : (sauda.crossQuantity > 0 ? 'cross' : 'partial');

      saudaUpdates.push({
        updateOne: {
          filter: { _id: sauda._id },
          update: { delivered: newDelivered, status: newStatus, updatedBy: req.user._id }
        }
      });

      invoiceSaudaRecords.push({
        invoiceId: record._id,
        saudaId: sauda._id,
        weight: fineToUse,
        fine: fineToUse,
        createdBy: req.user._id
      });

      remainingWeight -= fineToUse;
    }

    const writeOps = [];
    if (saudaUpdates.length > 0) writeOps.push(Sauda.bulkWrite(saudaUpdates));
    if (invoiceSaudaRecords.length > 0) writeOps.push(InvoiceSauda.insertMany(invoiceSaudaRecords));
    if (writeOps.length > 0) await Promise.all(writeOps);

    res.status(200).json({
      success: true,
      message: 'Record updated successfully',
      data: { record }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating record',
      error: error.message
    });
  }
};

const deletePakkiSalePurchase = async (req, res) => {
  try {
    const record = await PakkiSalePurchase.findByIdAndUpdate(
      req.params.id,
      { isDeleted: true, deletedBy: req.user._id },
      { new: true }
    );

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Record not found'
      });
    }

    // Revert sauda cuts
    const oldInvoiceSaudas = await InvoiceSauda.find({ invoiceId: record._id });
    for (const is of oldInvoiceSaudas) {
      const sauda = await Sauda.findById(is.saudaId);
      if (sauda) {
        const newDelivered = Math.max(0, Number(sauda.delivered) - is.weight);
        const newStatus = newDelivered <= 0 ? (sauda.crossQuantity > 0 ? 'cross' : 'pending') : ((newDelivered + (sauda.crossQuantity || 0)) >= Number(sauda.quantity) ? 'delivered' : (sauda.crossQuantity > 0 ? 'cross' : 'partial'));
        await Sauda.findByIdAndUpdate(is.saudaId, { delivered: newDelivered, status: newStatus });
      }
    }
    await InvoiceSauda.deleteMany({ invoiceId: record._id });

    res.status(200).json({
      success: true,
      message: 'Record deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting record',
      error: error.message
    });
  }
};

const getChorsaPakki = async (req, res) => {
  // Force chorsaType to 'chorsa-999' and delegate to existing list function
  req.query.chorsaType = 'chorsa-999';
  await getAllPakkiSalePurchase(req, res);
};

const getBankPakki = async (req, res) => {
  // Force chorsaType to 'bank-9999' and delegate to existing list function
  req.query.chorsaType = 'bank-9999';
  await getAllPakkiSalePurchase(req, res);
};

const getPakkiStock = async (req, res) => {
  try {
    const userId = req.user._id;
    const { date } = req.query;

    let targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(23, 59, 59, 999);

    // 1. Get latest PhysicalStockVerification before target date
    const latestVerification = await PhysicalStockVerification.findOne({ 
      isDeleted: false,
      date: { $lte: targetDate }
    })
      .sort({ date: -1, createdAt: -1 })
      .lean();

    // 2. Get CompanyProfile
    const companyProfile = await CompanyProfile.findOne({ userId, isDeleted: false }).lean();

    // Default opening fine and dates
    const openingFineChorsa = companyProfile ? Number(companyProfile.openingFine) || 0 : 0;
    const openingFineBank = companyProfile ? Number(companyProfile.openingFine9999) || 0 : 0;

    const openingFineChorsaDate = companyProfile?.openingFineDate ? new Date(companyProfile.openingFineDate) : null;
    const openingFineBankDate = companyProfile?.openingFine9999Date ? new Date(companyProfile.openingFine9999Date) : null;

    // Determine start date and initial stock for Chorsa
    let chorsaInitialStock = 0;
    let chorsaStartDate = null;
    let isChorsaVerification = false;

    if (latestVerification && latestVerification.chorsa999 && latestVerification.chorsa999.physicalWeight !== undefined && latestVerification.chorsa999.physicalWeight !== null) {
      chorsaInitialStock = Number(latestVerification.chorsa999.physicalWeight);
      chorsaStartDate = new Date(latestVerification.date);
      isChorsaVerification = true;
    } else {
      chorsaInitialStock = openingFineChorsa;
      chorsaStartDate = openingFineChorsaDate;
    }

    // Determine start date and initial stock for Bank
    let bankInitialStock = 0;
    let bankStartDate = null;
    let isBankVerification = false;

    if (latestVerification && latestVerification.bank9999 && latestVerification.bank9999.physicalWeight !== undefined && latestVerification.bank9999.physicalWeight !== null) {
      bankInitialStock = Number(latestVerification.bank9999.physicalWeight);
      bankStartDate = new Date(latestVerification.date);
      isBankVerification = true;
    } else {
      bankInitialStock = openingFineBank;
      bankStartDate = openingFineBankDate;
    }

    // 3. Sum Chorsa buy/sell transactions after start date
    const chorsaFilter = {
      chorsaType: 'chorsa-999',
      isDeleted: false,
      date: { $lte: targetDate }
    };
    if (chorsaStartDate) {
      if (isChorsaVerification) {
        chorsaFilter.$or = [
          { date: { $gt: chorsaStartDate, $lte: targetDate } },
          { date: chorsaStartDate, createdAt: { $gt: latestVerification.createdAt } }
        ];
        delete chorsaFilter.date; // Remove simple date filter since we use $or
      } else {
        chorsaFilter.date = { $gte: chorsaStartDate, $lte: targetDate };
      }
    }
    const chorsaTx = await PakkiSalePurchase.aggregate([
      { $match: chorsaFilter },
      {
        $group: {
          _id: '$type',
          totalWeight: { $sum: '$weight' }
        }
      }
    ]);

    const chorsaBuyWeight = chorsaTx.find(t => t._id === 'buy')?.totalWeight || 0;
    const chorsaSellWeight = chorsaTx.find(t => t._id === 'sell')?.totalWeight || 0;

    // Get MetalBadla givenSilver after start date
    const chorsaBadlaFilter = { 
      isDeleted: false,
      date: { $lte: targetDate }
    };
    if (chorsaStartDate) {
      if (isChorsaVerification) {
        chorsaBadlaFilter.$or = [
          { date: { $gt: chorsaStartDate, $lte: targetDate } },
          { date: chorsaStartDate, createdAt: { $gt: latestVerification.createdAt } }
        ];
        delete chorsaBadlaFilter.date; // Remove simple date filter since we use $or
      } else {
        chorsaBadlaFilter.date = { $gte: chorsaStartDate, $lte: targetDate };
      }
    }
    const MetalBadla = require('../models/MetalBadla.model');
    const chorsaBadlaTx = await MetalBadla.aggregate([
      { $match: chorsaBadlaFilter },
      {
        $group: {
          _id: null,
          totalGiven: { $sum: '$givenSilver' }
        }
      }
    ]);
    const chorsaBadlaWeight = chorsaBadlaTx[0]?.totalGiven || 0;

    const currentChorsaStock = chorsaInitialStock + chorsaBuyWeight - chorsaSellWeight - chorsaBadlaWeight;

    // 4. Sum Bank buy/sell transactions after start date
    const bankFilter = {
      chorsaType: 'bank-9999',
      isDeleted: false,
      date: { $lte: targetDate }
    };
    if (bankStartDate) {
      if (isBankVerification) {
        bankFilter.$or = [
          { date: { $gt: bankStartDate, $lte: targetDate } },
          { date: bankStartDate, createdAt: { $gt: latestVerification.createdAt } }
        ];
        delete bankFilter.date; // Remove simple date filter since we use $or
      } else {
        bankFilter.date = { $gte: bankStartDate, $lte: targetDate };
      }
    }
    const bankTx = await PakkiSalePurchase.aggregate([
      { $match: bankFilter },
      {
        $group: {
          _id: '$type',
          totalWeight: { $sum: '$weight' }
        }
      }
    ]);

    const bankBuyWeight = bankTx.find(t => t._id === 'buy')?.totalWeight || 0;
    const bankSellWeight = bankTx.find(t => t._id === 'sell')?.totalWeight || 0;
    const currentBankStock = bankInitialStock + bankBuyWeight - bankSellWeight;

    // Calculate Today's weights strictly for targetDate day
    const todayStart = new Date(targetDate);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(targetDate);
    todayEnd.setHours(23, 59, 59, 999);

    const todayFilter = {
      isDeleted: false,
      date: { $gte: todayStart, $lte: todayEnd }
    };

    const todayChorsaTx = await PakkiSalePurchase.aggregate([
      { $match: { ...todayFilter, chorsaType: 'chorsa-999' } },
      {
        $group: {
          _id: '$type',
          totalWeight: { $sum: '$weight' }
        }
      }
    ]);
    const todayChorsaBuyWeight = todayChorsaTx.find(t => t._id === 'buy')?.totalWeight || 0;
    const todayChorsaSellWeight = todayChorsaTx.find(t => t._id === 'sell')?.totalWeight || 0;

    const todayBankTx = await PakkiSalePurchase.aggregate([
      { $match: { ...todayFilter, chorsaType: 'bank-9999' } },
      {
        $group: {
          _id: '$type',
          totalWeight: { $sum: '$weight' }
        }
      }
    ]);
    const todayBankBuyWeight = todayBankTx.find(t => t._id === 'buy')?.totalWeight || 0;
    const todayBankSellWeight = todayBankTx.find(t => t._id === 'sell')?.totalWeight || 0;

    const todayBadlaTx = await MetalBadla.aggregate([
      { $match: todayFilter },
      {
        $group: {
          _id: null,
          totalGiven: { $sum: '$givenSilver' }
        }
      }
    ]);
    const todayChorsaBadlaWeight = todayBadlaTx[0]?.totalGiven || 0;

    res.status(200).json({
      success: true,
      data: {
        chorsaStock: parseFloat(currentChorsaStock.toFixed(2)),
        chorsaBuyWeight: parseFloat(todayChorsaBuyWeight.toFixed(2)),
        chorsaSellWeight: parseFloat(todayChorsaSellWeight.toFixed(2)),
        chorsaBadlaWeight: parseFloat(todayChorsaBadlaWeight.toFixed(2)),
        chorsaInitialStock: parseFloat(chorsaInitialStock.toFixed(2)),
        bankStock: parseFloat(currentBankStock.toFixed(2)),
        bankBuyWeight: parseFloat(todayBankBuyWeight.toFixed(2)),
        bankSellWeight: parseFloat(todayBankSellWeight.toFixed(2)),
        bankInitialStock: parseFloat(bankInitialStock.toFixed(2)),
        latestVerificationDate: latestVerification?.date || null
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error calculating stock details',
      error: error.message
    });
  }
};

module.exports = {
  createPakkiSalePurchase,
  getAllPakkiSalePurchase,
  getPakkiSalePurchaseById,
  updatePakkiSalePurchase,
  deletePakkiSalePurchase,
  getChorsaPakki,
  getBankPakki,
  getPakkiStock,
  calculateCurrentStock
};
