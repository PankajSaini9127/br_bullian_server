const Sauda = require('../models/Sauda.model');
const SaudaCrosscut = require('../models/SaudaCrosscut.model');
const { generateSaudaNo } = require('../utils/saudaGenerator');

const createSauda = async (req, res) => {
  try {
    const { partyId, saudaDate, quantity, rate, saudaType, delivered, saudaCategory } = req.body;

    if (!partyId || !saudaDate || !quantity || !rate || !saudaType) {
      return res.status(400).json({
        success: false,
        message: 'Party id, date, quantity, rate, and sauda type are required'
      });
    }

    // Set default value for delivered
    const deliveredValue = delivered || 0;

    // Default status to pending
    const statusValue = 'pending';

    if (!['sales', 'purchase'].includes(saudaType)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Sauda type must be either sales or purchase' 
      });
    }

    const saudaNo = await generateSaudaNo();

    // Always check for available source saudas for cross cut
    const sourceSaudaType = saudaType === 'sales' ? 'purchase' : 'sales';
    
    const sourceSaudas = await Sauda.find({
      partyId,
      saudaType: sourceSaudaType,
      status: { $in: ['pending', 'partial', 'cross'] },
      isDeleted: false,
      isActive: true
    }).sort({ saudaDate: -1 });

    const availableSourceSaudas = sourceSaudas
      .map(sauda => ({
        _id: sauda._id,
        saudaNo: sauda.saudaNo,
        quantity: sauda.quantity,
        delivered: sauda.delivered,
        crossQuantity: sauda.crossQuantity,
        availableQuantity: sauda.quantity - sauda.delivered - sauda.crossQuantity,
        rate: sauda.rate
      }))
      .filter(sauda => sauda.availableQuantity > 0);

    // If sufficient source saudas available, do cross cut
    if (availableSourceSaudas.length > 0) {
      const totalAvailableQuantity = availableSourceSaudas.reduce((sum, sauda) => sum + sauda.availableQuantity, 0);

      if (totalAvailableQuantity >= quantity) {
        // Distribute quantity across source saudas
        let remainingQuantity = quantity;
        const sourceSaudaDetails = [];
        let totalProfitLoss = 0;

        console.log(availableSourceSaudas)
        for (const sourceSauda of availableSourceSaudas) {
          if (remainingQuantity <= 0) break;

          const crosscutQuantity = Math.min(remainingQuantity, sourceSauda.availableQuantity);
          const sourceRate = sourceSauda.rate;
          const targetRate = rate;
          const targetQuantity = quantity;
          const profitLoss = (targetRate * (targetQuantity / 1000)) - (sourceRate * (crosscutQuantity / 1000));
          
          totalProfitLoss += profitLoss;
          remainingQuantity -= crosscutQuantity;

          sourceSaudaDetails.push({
            sourceSaudaId: sourceSauda._id,
            sourceRate,
            crosscutQuantity,
            profitLoss
          });
        }

        // Determine overall credit/debit type
        const creditDebitType = totalProfitLoss >= 0 ? 'credit' : 'debit';
        const amount = Math.abs(totalProfitLoss);

        // Create cross cut record
        const newSauda = await Sauda.create({
          saudaNo,
          partyId,
          saudaDate,
          quantity,
          rate,
          saudaType,
          saudaCategory: saudaCategory || 'kachi',
          isCrosscut: true,
          status: 'delivered',
          crossQuantity: quantity,
          createdBy: req.user._id
        });

        // Create SaudaCrosscut records for each source sauda
        for (const sourceDetail of sourceSaudaDetails) {
          await SaudaCrosscut.create({
            sourceSaudaId: sourceDetail.sourceSaudaId,
            targetSaudaId: newSauda._id,
            crosscutDate: new Date(),
            crosscutQuantity: sourceDetail.crosscutQuantity,
            sourceRate: sourceDetail.sourceRate,
            targetRate: rate,
            targetQuantity: quantity,
            profitLoss: sourceDetail.profitLoss,
            creditDebitType,
            amount,
            status: 'completed',
            createdBy: req.user._id
          });

          // Update source sauda
          const sourceSauda = await Sauda.findById(sourceDetail.sourceSaudaId);
          const newCrossQuantity = sourceSauda.crossQuantity + sourceDetail.crosscutQuantity;
          const isFullySettled = (Number(sourceSauda.delivered || 0) + newCrossQuantity) >= Number(sourceSauda.quantity);
          const newStatus = isFullySettled ? 'delivered' : 'cross';
          await Sauda.findByIdAndUpdate(sourceDetail.sourceSaudaId, {
            crossQuantity: newCrossQuantity,
            isCrosscut: true,
            status: newStatus
          });
        }

        return res.status(201).json({
          success: true,
          message: 'Sauda created with cross cut successfully',
          data: { sauda: newSauda }
        });
      }
    }

    // Normal sauda creation
    const sauda = await Sauda.create({
      saudaNo,
      partyId,
      delivered: deliveredValue,
      status: statusValue,
      saudaDate,
      quantity,
      rate,
      saudaType,
      saudaCategory: saudaCategory || 'kachi',
      isCrosscut: false,
      createdBy: req.user._id
    });

    res.status(201).json({
      success: true,
      message: 'Sauda created successfully',
      data: { sauda }
    });
  } catch (error) {
    console.error('Create Sauda Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error creating sauda', 
      error: error.message 
    });
  }
};

const getAllSaudas = async (req, res) => {
  try {
    const { partyId, type, startDate, endDate, page = 1, limit = 10 } = req.query;

    if (!type) {
      return res.status(400).json({ 
        success: false, 
        message: 'Sauda type is required' 
      });
    }

    if (!['sales', 'purchase'].includes(type)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Sauda type must be either sales or purchase' 
      });
    }

    const filter = { isDeleted: false, saudaType: type };
    if (partyId) {
      filter.partyId = partyId;
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
    console.error('Get All Saudas Error:', error);
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
    const { partyId, saudaDate, quantity, rate, saudaType, isActive, delivered, saudaCategory } = req.body;

    const updateData = { partyId, saudaDate, quantity, rate, saudaType, isActive, updatedBy: req.user._id };
    if (saudaCategory) updateData.saudaCategory = saudaCategory;

    // Only update delivered if provided
    if (delivered !== undefined) {
      updateData.delivered = delivered;

      // Calculate status based on delivered quantity
      const existingSauda = await Sauda.findById(req.params.id);
      const qtyToUse = quantity !== undefined ? quantity : existingSauda.quantity;

      if (delivered === 0) {
        updateData.status = 'pending';
      } else if (delivered < Number(qtyToUse)) {
        updateData.status = 'partial';
      } else if (delivered === Number(qtyToUse)) {
        updateData.status = 'delivered';
      } else {
        updateData.status = 'delivered'; // If delivered > quantity, still mark as delivered
      }
    }

    const sauda = await Sauda.findByIdAndUpdate(
      req.params.id,
      updateData,
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

const getPartySaudaSummary = async (req, res) => {
  try {
    const { partyId } = req.params;

    if (!partyId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Party id is required' 
      });
    }

    // Find pending and partial purchase saudas
    const purchaseSaudas = await Sauda.find({
      partyId,
      saudaType: 'purchase',
      status: { $in: ['pending', 'partial'] },
      isDeleted: false
    });

    // Find pending and partial sales saudas
    const salesSaudas = await Sauda.find({
      partyId,
      saudaType: 'sales',
      status: { $in: ['pending', 'partial'] },
      isDeleted: false
    });

    // Calculate totals for purchase
    const purchaseSummary = purchaseSaudas.reduce((acc, sauda) => {
      return {
        totalQuantity: acc.totalQuantity + sauda.quantity,
        delivered: acc.delivered + sauda.delivered,
        count: acc.count + 1
      };
    }, { totalQuantity: 0, delivered: 0, count: 0 });

    purchaseSummary.remaining = purchaseSummary.totalQuantity - purchaseSummary.delivered;

    // Calculate totals for sales
    const salesSummary = salesSaudas.reduce((acc, sauda) => {
      return {
        totalQuantity: acc.totalQuantity + sauda.quantity,
        delivered: acc.delivered + sauda.delivered,
        count: acc.count + 1
      };
    }, { totalQuantity: 0, delivered: 0, count: 0 });

    salesSummary.remaining = salesSummary.totalQuantity - salesSummary.delivered;

    res.status(200).json({
      success: true,
      data: {
        partyId,
        purchase: {
          totalQuantity: parseFloat(purchaseSummary.totalQuantity.toFixed(1)),
          delivered: parseFloat(purchaseSummary.delivered.toFixed(1)),
          remaining: parseFloat(purchaseSummary.remaining.toFixed(1)),
          count: purchaseSummary.count
        },
        sales: {
          totalQuantity: parseFloat(salesSummary.totalQuantity.toFixed(1)),
          delivered: parseFloat(salesSummary.delivered.toFixed(1)),
          remaining: parseFloat(salesSummary.remaining.toFixed(1)),
          count: salesSummary.count
        },
        totalRemaining: parseFloat((purchaseSummary.remaining + salesSummary.remaining).toFixed(1))
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching party sauda summary', 
      error: error.message 
    });
  }
};

const getPartyPendingKachiSaudas = async (req, res) => {
  try {
    const { partyId } = req.params;
    const { saudaType } = req.query; // optional filter

    if (!partyId) {
      return res.status(400).json({ success: false, message: 'Party id is required' });
    }

    const baseFilter = {
      partyId,
      saudaCategory: 'kachi',
      status: { $in: ['pending', 'partial', 'cross'] },
      isDeleted: false
    };

    if (saudaType) baseFilter.saudaType = saudaType;

    const saudas = await Sauda.find(baseFilter)
      .sort({ saudaDate: 1 })
      .lean();

    // Group by saudaType
    const grouped = {};
    for (const sauda of saudas) {
      const key = `${sauda.saudaType}`;
      const remaining = Number(sauda.quantity) - Number(sauda.delivered) - (sauda.crossQuantity || 0);
      if (remaining <= 0) continue;

      if (!grouped[key]) {
        grouped[key] = {
          saudaType: sauda.saudaType,
          saudas: [],
          totalQuantity: 0,
          totalDelivered: 0,
          totalRemaining: 0
        };
      }
      grouped[key].saudas.push({
        _id: sauda._id,
        saudaNo: sauda.saudaNo,
        saudaDate: sauda.saudaDate,
        quantity: sauda.quantity,
        delivered: sauda.delivered,
        remaining: parseFloat(remaining.toFixed(2)),
        rate: sauda.rate,
        status: sauda.status,
        saudaCategory: sauda.saudaCategory
      });
      grouped[key].totalQuantity += Number(sauda.quantity);
      grouped[key].totalDelivered += Number(sauda.delivered);
      grouped[key].totalRemaining += remaining;
    }

    const groups = Object.values(grouped).map(g => ({
      ...g,
      totalQuantity: parseFloat(g.totalQuantity.toFixed(2)),
      totalDelivered: parseFloat(g.totalDelivered.toFixed(2)),
      totalRemaining: parseFloat(g.totalRemaining.toFixed(2))
    }));

    res.status(200).json({ success: true, data: { groups, partyId } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching party pending kachi saudas', error: error.message });
  }
};
const getPartyPendingPakkiSaudas = async (req, res) => {
  try {
    const { partyId } = req.params;
    const { saudaType, saudaCategory } = req.query; // optional filters

    if (!partyId) {
      return res.status(400).json({ success: false, message: 'Party id is required' });
    }

    const baseFilter = {
      partyId,
      status: { $in: ['pending', 'partial', 'cross'] },
      isDeleted: false,
    };
    
    if (saudaCategory) {
      baseFilter.saudaCategory = saudaCategory;
    } else {
      baseFilter.saudaCategory = { $in: ['chorsa-999', 'bank-9999'] };
    }
    
    if (saudaType) baseFilter.saudaType = saudaType;

    const saudas = await Sauda.find(baseFilter)
      .sort({ saudaDate: 1 })
      .lean();

    const grouped = {};
    for (const sauda of saudas) {
      const key = `${sauda.saudaType}-${sauda.saudaCategory}`;
      const remaining = Number(sauda.quantity) - Number(sauda.delivered) - (sauda.crossQuantity || 0);
      if (remaining <= 0) continue;

      if (!grouped[key]) {
        grouped[key] = {
          saudaType: sauda.saudaType,
          saudaCategory: sauda.saudaCategory,
          saudas: [],
          totalQuantity: 0,
          totalDelivered: 0,
          totalRemaining: 0,
        };
      }
      grouped[key].saudas.push({
        _id: sauda._id,
        saudaNo: sauda.saudaNo,
        saudaDate: sauda.saudaDate,
        quantity: sauda.quantity,
        delivered: sauda.delivered,
        remaining: parseFloat(remaining.toFixed(2)),
        rate: sauda.rate,
        status: sauda.status,
        saudaCategory: sauda.saudaCategory,
      });
      grouped[key].totalQuantity += Number(sauda.quantity);
      grouped[key].totalDelivered += Number(sauda.delivered);
      grouped[key].totalRemaining += remaining;
    }

    const groups = Object.values(grouped).map(g => ({
      ...g,
      totalQuantity: parseFloat(g.totalQuantity.toFixed(2)),
      totalDelivered: parseFloat(g.totalDelivered.toFixed(2)),
      totalRemaining: parseFloat(g.totalRemaining.toFixed(2)),
    }));

    res.status(200).json({ success: true, data: { groups, partyId } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching party pending pakki saudas', error: error.message });
  }
};

module.exports = {
  createSauda,
  getAllSaudas,
  getSaudaById,
  updateSauda,
  deleteSauda,
  getPartySaudaSummary,
  getPartyPendingPakkiSaudas,
  getPartyPendingKachiSaudas
};

