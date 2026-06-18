const SalesInvoice = require('../models/SalesInvoice.model');
const Pugga = require('../models/Pugga.model');
const Sauda = require('../models/Sauda.model');
const InvoiceSauda = require('../models/InvoiceSauda.model');
const { generateSalesInvoiceNo } = require('../utils/salesInvoiceGenerator');
const { generateSaudaNo } = require('../utils/saudaGenerator');
const { roundToHalf } = require('../utils/rounding.util');

const createSalesInvoice = async (req, res) => {
  try {
    const { partyId, invoiceDate, paggaIds, totalAmount, bhavcut } = req.body;

    if (!partyId || !invoiceDate || !paggaIds || !Array.isArray(paggaIds) || paggaIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Party id, invoice date, and pugga ids array are required'
      });
    }

    const salesInvoiceNo = await generateSalesInvoiceNo();

    const salesInvoice = await SalesInvoice.create({
      salesInvoiceNo,
      partyId,
      invoiceDate,
      paggaIds,
      totalAmount: totalAmount || 0,
      createdBy: req.user._id
    });

    // Create sauda from bhavcut data if provided
    let bhavcutSauda = null;
    if (bhavcut && bhavcut.weight > 0 && bhavcut.rate) {
      const saudaNo = await generateSaudaNo();
      bhavcutSauda = await Sauda.create({
        saudaNo,
        partyId,
        saudaDate: invoiceDate,
        quantity: bhavcut.weight,
        delivered: bhavcut.weight,
        rate: bhavcut.rate,
        saudaType: 'sales',
        isBhavCut: false,
        status: 'delivered',
        createdBy: req.user._id
      });
    }

    // Fetch puggas for fine calculation
    const puggas = await Pugga.find({ _id: { $in: paggaIds } });

    // Calculate total fine from puggas (each rounded to nearest 0.5)
    const totalFine = puggas.reduce((sum, p) => sum + roundToHalf((Number(p.weight) * Number(p.touch)) / 100), 0);

    // Find party's pending/partial sales saudas, oldest first
    const saudas = await Sauda.find({
      partyId,
      saudaType: 'sales',
      status: { $in: ['pending', 'partial'] },
      isDeleted: false
    }).sort({ saudaDate: 1 });

    // Add bhavcut sauda to the beginning if it was created
    if (bhavcutSauda) {
      saudas.unshift(bhavcutSauda);
    }

    // Distribute sales invoice fine across sales saudas
    let remainingFine = totalFine;
    const saudaUpdates = [];
    const invoiceSaudaRecords = [];

    for (const sauda of saudas) {
      if (remainingFine <= 0) break;

      const saudaRemainingQty = sauda.quantity - sauda.delivered;
      if (saudaRemainingQty <= 0) continue;

      const fineToUse = roundToHalf(Math.min(remainingFine, saudaRemainingQty));
      const weightToUse = fineToUse;
      const newDelivered = sauda.delivered + weightToUse;
      const newStatus = newDelivered >= sauda.quantity ? 'delivered' : 'partial';

      saudaUpdates.push({
        updateOne: {
          filter: { _id: sauda._id },
          update: { delivered: newDelivered, status: newStatus, updatedBy: req.user._id }
        }
      });

      invoiceSaudaRecords.push({
        invoiceId: salesInvoice._id,
        saudaId: sauda._id,
        weight: weightToUse,
        fine: fineToUse,
        createdBy: req.user._id
      });

      remainingFine -= fineToUse;
    }

    // Link bhavcut sauda to invoice if it was created
    if (bhavcutSauda) {
      invoiceSaudaRecords.push({
        invoiceId: salesInvoice._id,
        saudaId: bhavcutSauda._id,
        weight: bhavcut.weight,
        fine: bhavcut.weight,
        createdBy: req.user._id
      });
    }

    if (saudaUpdates.length > 0) {
      await Sauda.bulkWrite(saudaUpdates);
    }
    if (invoiceSaudaRecords.length > 0) {
      await InvoiceSauda.insertMany(invoiceSaudaRecords);
    }

    // Update puggas isSold to true
    await Pugga.updateMany(
      { _id: { $in: paggaIds } },
      { isSold: true, updatedBy: req.user._id }
    );

    const salesInvoiceObj = salesInvoice.toObject();
    salesInvoiceObj.saudaDistribution = invoiceSaudaRecords;

    res.status(201).json({
      success: true,
      message: 'Sales invoice created successfully',
      data: { salesInvoice: salesInvoiceObj }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error creating sales invoice', 
      error: error.message 
    });
  }
};

const getAllSalesInvoices = async (req, res) => {
  try {
    const { partyId, startDate, endDate, page = 1, limit = 10 } = req.query;
    const filter = {     };
    if (partyId) {
      filter.partyId = partyId;
    }
    if (startDate && endDate) {
      filter.invoiceDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    const salesInvoices = await SalesInvoice.find(filter)
      .populate('partyId', 'partyName contactNo')
      .populate('paggaIds')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);
    
    const total = await SalesInvoice.countDocuments(filter);
    
    res.status(200).json({
      success: true,
      data: { 
        salesInvoices,
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
      message: 'Error fetching sales invoices', 
      error: error.message 
    });
  }
};

const getSalesInvoiceById = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    
    const salesInvoice = await SalesInvoice.findOne({ _id: req.params.id,   })
      .populate('partyId', 'partyName contactNo address email gstin');
    
    if (!salesInvoice) {
      return res.status(404).json({ 
        success: false, 
        message: 'Sales invoice not found' 
      });
    }

    const total = salesInvoice.paggaIds.length;
    const skip = (pageNum - 1) * limitNum;
    const paginatedPaggaIds = salesInvoice.paggaIds.slice(skip, skip + limitNum);
    
    const paggas = await Pugga.find({ _id: { $in: paginatedPaggaIds } });
    
    const salesInvoiceObj = salesInvoice.toObject();
    salesInvoiceObj.paggaIds = paggas;
    salesInvoiceObj.pagination = {
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      totalItems: total,
      itemsPerPage: limitNum
    };

    res.status(200).json({
      success: true,
      data: { salesInvoice: salesInvoiceObj }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching sales invoice', 
      error: error.message 
    });
  }
};

const updateSalesInvoice = async (req, res) => {
  try {
    const { partyId, invoiceDate, paggaIds, totalAmount, isActive, bhavcut } = req.body;

    // Get existing sales invoice to find old paggaIds
    const existingSalesInvoice = await SalesInvoice.findById(req.params.id);
    if (!existingSalesInvoice) {
      return res.status(404).json({ 
        success: false, 
        message: 'Sales invoice not found' 
      });
    }

    // Revert old sauda distributions
    const oldInvoiceSaudas = await InvoiceSauda.find({ invoiceId: existingSalesInvoice._id, isDeleted: false });
    for (const is of oldInvoiceSaudas) {
      const sauda = await Sauda.findById(is.saudaId);
      if (sauda) {
        const newDelivered = Math.max(0, sauda.delivered - is.weight);
        const newStatus = newDelivered <= 0 ? 'pending' : newDelivered >= sauda.quantity ? 'delivered' : 'partial';
        await Sauda.findByIdAndUpdate(is.saudaId, { delivered: newDelivered, status: newStatus });
      }
    }
    await InvoiceSauda.deleteMany({ invoiceId: existingSalesInvoice._id });

    const salesInvoice = await SalesInvoice.findByIdAndUpdate(
      req.params.id,
      { partyId, invoiceDate, paggaIds, totalAmount, isActive, updatedBy: req.user._id },
      { new: true, runValidators: true }
    );

    // Create sauda from bhavcut data if provided
    let bhavcutSauda = null;
    if (bhavcut && bhavcut.weight > 0 && bhavcut.rate) {
      const saudaNo = await generateSaudaNo();
      bhavcutSauda = await Sauda.create({
        saudaNo,
        partyId: salesInvoice.partyId,
        saudaDate: invoiceDate,
        quantity: bhavcut.weight,
        delivered: bhavcut.weight,
        rate: bhavcut.rate,
        saudaType: 'sales',
        isBhavCut: false,
        status: 'delivered',
        createdBy: req.user._id
      });
    }

    // Mark newly added puggas as sold
    const oldPaggaIds = existingSalesInvoice.paggaIds.map(id => id.toString());
    const newPaggaIds = paggaIds ? paggaIds.map(id => (id._id || id).toString()) : [];
    const addedPaggaIds = newPaggaIds.filter(id => !oldPaggaIds.includes(id));
    if (addedPaggaIds.length > 0) {
      await Pugga.updateMany(
        { _id: { $in: addedPaggaIds } },
        { isSold: true, updatedBy: req.user._id }
      );
    }

    // Mark removed puggas as unsold
    const removedPaggaIds = oldPaggaIds.filter(id => !newPaggaIds.includes(id));
    if (removedPaggaIds.length > 0) {
      await Pugga.updateMany(
        { _id: { $in: removedPaggaIds } },
        { isSold: false, updatedBy: req.user._id }
      );
    }

    // Recalculate and redistribute sauda
    const updatedPuggas = await Pugga.find({ _id: { $in: newPaggaIds } });
    const totalFine = updatedPuggas.reduce((sum, p) => sum + roundToHalf((Number(p.weight) * Number(p.touch)) / 100), 0);

    if (totalFine > 0) {
      const saudas = await Sauda.find({
        partyId: salesInvoice.partyId,
        saudaType: 'sales',
        status: { $in: ['pending', 'partial'] },
        isDeleted: false
      }).sort({ saudaDate: 1 });

      // Add bhavcut sauda to the beginning if it was created
      if (bhavcutSauda) {
        saudas.unshift(bhavcutSauda);
      }

      let remainingFine = totalFine;
      const saudaUpdates = [];
      const invoiceSaudaRecords = [];

      for (const sauda of saudas) {
        if (remainingFine <= 0) break;

        const saudaRemainingQty = sauda.quantity - sauda.delivered;
        if (saudaRemainingQty <= 0) continue;

        const fineToUse = roundToHalf(Math.min(remainingFine, saudaRemainingQty));
        const weightToUse = fineToUse;
        const newDelivered = sauda.delivered + weightToUse;
        const newStatus = newDelivered >= sauda.quantity ? 'delivered' : 'partial';

        saudaUpdates.push({
          updateOne: {
            filter: { _id: sauda._id },
            update: { delivered: newDelivered, status: newStatus, updatedBy: req.user._id }
          }
        });

        invoiceSaudaRecords.push({
          invoiceId: salesInvoice._id,
          saudaId: sauda._id,
          weight: weightToUse,
          fine: fineToUse,
          createdBy: req.user._id
        });

        remainingFine -= fineToUse;
      }

      // Link bhavcut sauda to invoice if it was created
      if (bhavcutSauda) {
        invoiceSaudaRecords.push({
          invoiceId: salesInvoice._id,
          saudaId: bhavcutSauda._id,
          weight: bhavcut.weight,
          fine: bhavcut.weight,
          createdBy: req.user._id
        });
      }

      if (saudaUpdates.length > 0) {
        await Sauda.bulkWrite(saudaUpdates);
      }
      if (invoiceSaudaRecords.length > 0) {
        await InvoiceSauda.insertMany(invoiceSaudaRecords);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Sales invoice updated successfully',
      data: { salesInvoice }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error updating sales invoice', 
      error: error.message 
    });
  }
};

const deleteSalesInvoice = async (req, res) => {
  try {
    const salesInvoice = await SalesInvoice.findByIdAndUpdate(
      req.params.id,
      { isDeleted: true, deletedBy: req.user._id },
      { new: true }
    );

    if (!salesInvoice) {
      return res.status(404).json({ 
        success: false, 
        message: 'Sales invoice not found' 
      });
    }

    res.status(200).json({
      success: true,
      message: 'Sales invoice deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error deleting sales invoice', 
      error: error.message 
    });
  }
};

const markAsDukanStock = async (req, res) => {
  try {
    const { paggaIds } = req.body;

    if (!paggaIds || !Array.isArray(paggaIds) || paggaIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'paggaIds array is required' 
      });
    }

    await Pugga.updateMany(
      { _id: { $in: paggaIds } },
      { isDukanStock: true, updatedBy: req.user._id }
    );

    res.status(200).json({
      success: true,
      message: 'Puggas marked as dukan stock successfully'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error marking puggas as dukan stock', 
      error: error.message 
    });
  }
};

module.exports = {
  createSalesInvoice,
  getAllSalesInvoices,
  getSalesInvoiceById,
  updateSalesInvoice,
  deleteSalesInvoice,
  markAsDukanStock
};
