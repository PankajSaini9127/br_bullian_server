const PhysicalStockVerification = require('../models/PhysicalStockVerification.model');
const PakkiSalePurchase = require('../models/PakkiSalePurchase.model');

const createPhysicalStockVerification = async (req, res) => {
  try {
    const { date, physicalFine999, physicalBalance, remark, chorsa999, bank9999, cash } = req.body;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date is required'
      });
    }

    const verificationDate = new Date(date);

    // Calculate system stock from PakkiSalePurchase up to this date
    const [chorsaBuy, chorsaSell, bankBuy, bankSell] = await Promise.all([
      PakkiSalePurchase.aggregate([
        { $match: { chorsaType: 'chorsa-999', type: 'buy', isDeleted: false, date: { $lte: verificationDate } } },
        { $group: { _id: null, totalWeight: { $sum: '$weight' }, totalPcs: { $sum: '$pcs' } } }
      ]),
      PakkiSalePurchase.aggregate([
        { $match: { chorsaType: 'chorsa-999', type: 'sell', isDeleted: false, date: { $lte: verificationDate } } },
        { $group: { _id: null, totalWeight: { $sum: '$weight' }, totalPcs: { $sum: '$pcs' } } }
      ]),
      PakkiSalePurchase.aggregate([
        { $match: { chorsaType: 'bank-9999', type: 'buy', isDeleted: false, date: { $lte: verificationDate } } },
        { $group: { _id: null, totalWeight: { $sum: '$weight' }, totalPcs: { $sum: '$pcs' } } }
      ]),
      PakkiSalePurchase.aggregate([
        { $match: { chorsaType: 'bank-9999', type: 'sell', isDeleted: false, date: { $lte: verificationDate } } },
        { $group: { _id: null, totalWeight: { $sum: '$weight' }, totalPcs: { $sum: '$pcs' } } }
      ])
    ]);

    const chorsaSystemWeight = (chorsaBuy[0]?.totalWeight || 0) - (chorsaSell[0]?.totalWeight || 0);
    const chorsaSystemPcs = (chorsaBuy[0]?.totalPcs || 0) - (chorsaSell[0]?.totalPcs || 0);
    const bankSystemWeight = (bankBuy[0]?.totalWeight || 0) - (bankSell[0]?.totalWeight || 0);
    const bankSystemPcs = (bankBuy[0]?.totalPcs || 0) - (bankSell[0]?.totalPcs || 0);

    const record = await PhysicalStockVerification.create({
      date,
      physicalFine999: physicalFine999 || 0,
      physicalBalance: physicalBalance || 0,
      chorsa999: {
        systemWeight: chorsa999?.systemWeight !== undefined ? chorsa999.systemWeight : chorsaSystemWeight,
        systemPcs: chorsa999?.systemPcs !== undefined ? chorsa999.systemPcs : chorsaSystemPcs,
        systemBuy: chorsa999?.systemBuy || 0,
        systemSell: chorsa999?.systemSell || 0,
        physicalWeight: chorsa999?.physicalWeight || 0,
        remark: chorsa999?.remark || ''
      },
      bank9999: {
        systemWeight: bank9999?.systemWeight !== undefined ? bank9999.systemWeight : bankSystemWeight,
        systemPcs: bank9999?.systemPcs !== undefined ? bank9999.systemPcs : bankSystemPcs,
        systemBuy: bank9999?.systemBuy || 0,
        systemSell: bank9999?.systemSell || 0,
        physicalWeight: bank9999?.physicalWeight || 0,
        remark: bank9999?.remark || ''
      },
      cash: {
        systemIn: cash?.systemIn || 0,
        systemOut: cash?.systemOut || 0,
        systemNet: cash?.systemNet || 0,
        physicalBalance: cash?.physicalBalance || physicalBalance || 0,
        remark: cash?.remark || remark || ''
      },
      remark: remark || '',
      createdBy: req.user._id
    });

    res.status(201).json({
      success: true,
      message: 'Physical stock verification created successfully',
      data: { record }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating physical stock verification',
      error: error.message
    });
  }
};

const getAllPhysicalStockVerifications = async (req, res) => {
  try {
    const { startDate, endDate, page = 1, limit = 10 } = req.query;
    const filter = { isDeleted: false };

    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const records = await PhysicalStockVerification.find(filter)
      .sort({ date: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await PhysicalStockVerification.countDocuments(filter);

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
      message: 'Error fetching physical stock verifications',
      error: error.message
    });
  }
};

const getPhysicalStockVerificationById = async (req, res) => {
  try {
    const record = await PhysicalStockVerification.findOne({ _id: req.params.id, isDeleted: false });

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Physical stock verification not found'
      });
    }

    res.status(200).json({
      success: true,
      data: { record }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching physical stock verification',
      error: error.message
    });
  }
};

const updatePhysicalStockVerification = async (req, res) => {
  try {
    const { date, physicalFine999, physicalBalance, remark, chorsa999, bank9999, cash, isActive } = req.body;

    const verificationDate = new Date(date);

    // Recalculate system stock from PakkiSalePurchase up to this date
    const [chorsaBuy, chorsaSell, bankBuy, bankSell] = await Promise.all([
      PakkiSalePurchase.aggregate([
        { $match: { chorsaType: 'chorsa-999', type: 'buy', isDeleted: false, date: { $lte: verificationDate } } },
        { $group: { _id: null, totalWeight: { $sum: '$weight' }, totalPcs: { $sum: '$pcs' } } }
      ]),
      PakkiSalePurchase.aggregate([
        { $match: { chorsaType: 'chorsa-999', type: 'sell', isDeleted: false, date: { $lte: verificationDate } } },
        { $group: { _id: null, totalWeight: { $sum: '$weight' }, totalPcs: { $sum: '$pcs' } } }
      ]),
      PakkiSalePurchase.aggregate([
        { $match: { chorsaType: 'bank-9999', type: 'buy', isDeleted: false, date: { $lte: verificationDate } } },
        { $group: { _id: null, totalWeight: { $sum: '$weight' }, totalPcs: { $sum: '$pcs' } } }
      ]),
      PakkiSalePurchase.aggregate([
        { $match: { chorsaType: 'bank-9999', type: 'sell', isDeleted: false, date: { $lte: verificationDate } } },
        { $group: { _id: null, totalWeight: { $sum: '$weight' }, totalPcs: { $sum: '$pcs' } } }
      ])
    ]);

    const chorsaSystemWeight = (chorsaBuy[0]?.totalWeight || 0) - (chorsaSell[0]?.totalWeight || 0);
    const chorsaSystemPcs = (chorsaBuy[0]?.totalPcs || 0) - (chorsaSell[0]?.totalPcs || 0);
    const bankSystemWeight = (bankBuy[0]?.totalWeight || 0) - (bankSell[0]?.totalWeight || 0);
    const bankSystemPcs = (bankBuy[0]?.totalPcs || 0) - (bankSell[0]?.totalPcs || 0);

    const record = await PhysicalStockVerification.findByIdAndUpdate(
      req.params.id,
      {
        date,
        physicalFine999,
        physicalBalance,
        chorsa999: {
          systemWeight: chorsa999?.systemWeight !== undefined ? chorsa999.systemWeight : chorsaSystemWeight,
          systemPcs: chorsa999?.systemPcs !== undefined ? chorsa999.systemPcs : chorsaSystemPcs,
          systemBuy: chorsa999?.systemBuy || 0,
          systemSell: chorsa999?.systemSell || 0,
          physicalWeight: chorsa999?.physicalWeight || 0,
          remark: chorsa999?.remark || ''
        },
        bank9999: {
          systemWeight: bank9999?.systemWeight !== undefined ? bank9999.systemWeight : bankSystemWeight,
          systemPcs: bank9999?.systemPcs !== undefined ? bank9999.systemPcs : bankSystemPcs,
          systemBuy: bank9999?.systemBuy || 0,
          systemSell: bank9999?.systemSell || 0,
          physicalWeight: bank9999?.physicalWeight || 0,
          remark: bank9999?.remark || ''
        },
        cash: {
          systemIn: cash?.systemIn || 0,
          systemOut: cash?.systemOut || 0,
          systemNet: cash?.systemNet || 0,
          physicalBalance: cash?.physicalBalance || physicalBalance || 0,
          remark: cash?.remark || remark || ''
        },
        remark,
        isActive,
        updatedBy: req.user._id
      },
      { new: true, runValidators: true }
    );

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Physical stock verification not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Physical stock verification updated successfully',
      data: { record }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating physical stock verification',
      error: error.message
    });
  }
};

const deletePhysicalStockVerification = async (req, res) => {
  try {
    const record = await PhysicalStockVerification.findByIdAndUpdate(
      req.params.id,
      { isDeleted: true, deletedBy: req.user._id, deletedAt: new Date() },
      { new: true }
    );

    if (!record) {
      return res.status(404).json({
        success: false,
        message: 'Physical stock verification not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Physical stock verification deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting physical stock verification',
      error: error.message
    });
  }
};

module.exports = {
  createPhysicalStockVerification,
  getAllPhysicalStockVerifications,
  getPhysicalStockVerificationById,
  updatePhysicalStockVerification,
  deletePhysicalStockVerification
};
