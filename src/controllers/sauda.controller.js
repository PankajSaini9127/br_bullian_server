const Sauda = require('../models/Sauda.model');
const { generateSaudaNo } = require('../utils/saudaGenerator');

const createSauda = async (req, res) => {
  try {
    const { partyId, saudaDate, quantity, rate, saudaType } = req.body;

    if (!partyId || !saudaDate || !quantity || !rate || !saudaType) {
      return res.status(400).json({ 
        success: false, 
        message: 'Party id, date, quantity, rate, and sauda type are required' 
      });
    }

    if (!['sales', 'purchase'].includes(saudaType)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Sauda type must be either sales or purchase' 
      });
    }

    const saudaNo = await generateSaudaNo();

    const sauda = await Sauda.create({
      saudaNo,
      partyId,
      saudaDate,
      quantity,
      rate,
      saudaType,
      createdBy: req.user._id
    });

    res.status(201).json({
      success: true,
      message: 'Sauda created successfully',
      data: { sauda }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error creating sauda', 
      error: error.message 
    });
  }
};

const getAllSaudas = async (req, res) => {
  try {
    const { partyId, saudaType, startDate, endDate, page = 1, limit = 10 } = req.query;
    const filter = {   };
    if (partyId) {
      filter.partyId = partyId;
    }
    if (saudaType) {
      filter.saudaType = saudaType;
    }
    if (startDate && endDate) {
      filter.saudaDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    const saudas = await Sauda.find(filter)
      .populate('partyId', 'partyName contactNo')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);
    
    const total = await Sauda.countDocuments(filter);
    
    res.status(200).json({
      success: true,
      data: { 
        saudas,
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
      message: 'Error fetching saudas', 
      error: error.message 
    });
  }
};

const getSaudaById = async (req, res) => {
  try {
    const sauda = await Sauda.findOne({ _id: req.params.id,   }).populate('partyId', 'partyName contactNo address email gstin');
    
    if (!sauda) {
      return res.status(404).json({ 
        success: false, 
        message: 'Sauda not found' 
      });
    }

    res.status(200).json({
      success: true,
      data: { sauda }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching sauda', 
      error: error.message 
    });
  }
};

const updateSauda = async (req, res) => {
  try {
    const { partyId, saudaDate, quantity, rate, saudaType, isActive } = req.body;

    const sauda = await Sauda.findByIdAndUpdate(
      req.params.id,
      { partyId, saudaDate, quantity, rate, saudaType, isActive, updatedBy: req.user._id },
      { new: true, runValidators: true }
    );

    if (!sauda) {
      return res.status(404).json({ 
        success: false, 
        message: 'Sauda not found' 
      });
    }

    res.status(200).json({
      success: true,
      message: 'Sauda updated successfully',
      data: { sauda }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error updating sauda', 
      error: error.message 
    });
  }
};

const deleteSauda = async (req, res) => {
  try {
    const sauda = await Sauda.findByIdAndUpdate(
      req.params.id,
      { isDeleted: true, deletedBy: req.user._id },
      { new: true }
    );

    if (!sauda) {
      return res.status(404).json({ 
        success: false, 
        message: 'Sauda not found' 
      });
    }

    res.status(200).json({
      success: true,
      message: 'Sauda deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error deleting sauda', 
      error: error.message 
    });
  }
};

module.exports = {
  createSauda,
  getAllSaudas,
  getSaudaById,
  updateSauda,
  deleteSauda
};
