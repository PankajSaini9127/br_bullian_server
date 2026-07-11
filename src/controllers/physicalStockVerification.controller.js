const PhysicalStockVerification = require('../models/PhysicalStockVerification.model');

const createPhysicalStockVerification = async (req, res) => {
  try {
    const { date, physicalFine999, physicalBalance, remark } = req.body;

    if (!date || physicalFine999 === undefined || physicalBalance === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Date, physicalFine999, and physicalBalance are required'
      });
    }

    const record = await PhysicalStockVerification.create({
      date,
      physicalFine999,
      physicalBalance,
      remark,
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
    const { date, physicalFine999, physicalBalance, remark, isActive } = req.body;

    const record = await PhysicalStockVerification.findByIdAndUpdate(
      req.params.id,
      { date, physicalFine999, physicalBalance, remark, isActive, updatedBy: req.user._id },
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
