const Invoice = require('../models/Invoice.model');
const Pugga = require('../models/Pugga.model');
const Sauda = require('../models/Sauda.model');
const InvoiceSauda = require('../models/InvoiceSauda.model');
const SalesInvoice = require('../models/SalesInvoice.model');
const { generateInvoiceNo } = require('../utils/invoiceGenerator');
const { generateSaudaNo } = require('../utils/saudaGenerator');
const { roundToHalf } = require('../utils/rounding.util');

const createInvoice = async (req, res) => {
  try {
    const { partyId, invoiceDate, totalAmount, paggaItems, bhavcut, isReturn, puggaIds } = req.body;

    if (!partyId || !invoiceDate) {
      return res.status(400).json({
        success: false,
        message: 'Party id and invoice date are required'
      });
    }

    const hasBhavcut = !isReturn && bhavcut && bhavcut.weight > 0 && bhavcut.rate;

    // Parallel: generate invoice no + sauda no (if bhavcut)
    const [invoiceNo, saudaNo] = await Promise.all([
      generateInvoiceNo(),
      hasBhavcut ? generateSaudaNo() : Promise.resolve(null)
    ]);

    const invoice = await Invoice.create({
      invoiceNo,
      partyId,
      invoiceDate,
      totalAmount: totalAmount || 0,
      isReturn: isReturn || false,
      createdBy: req.user._id
    });

    let saudaUpdates = [];
    let invoiceSaudaRecords = [];
    let totalFine = 0;

    if (isReturn === true && puggaIds && puggaIds.length > 0) {
      // Parallel: fetch returned puggas + saudas for reversal
      const [returnedPuggas, saudas] = await Promise.all([
        Pugga.find({ _id: { $in: puggaIds } }).select('weight touch invoiceId').lean(),
        Sauda.find({
          partyId,
          saudaType: 'purchase',
          status: { $in: ['partial', 'delivered'] },
          isDeleted: false
        }).sort({ createdAt: -1 }).lean()
      ]);

      totalFine = returnedPuggas.reduce((sum, p) => sum + roundToHalf((Number(p.weight) * Number(p.touch)) / 100), 0);

      let remainingFine = totalFine;
      for (const sauda of saudas) {
        const saudaRemainingQty = Number(sauda.delivered);
        if (saudaRemainingQty <= 0) continue;

        const fineToUse = roundToHalf(Math.min(remainingFine, saudaRemainingQty));
        if (fineToUse <= 0) break;

        const newDelivered = Math.max(0, Number(sauda.delivered) - fineToUse);
        const newReturnedFine = Number(sauda.returnedFine || 0) + fineToUse;
        const newStatus = newDelivered <= 0 ? 'pending' : newDelivered >= Number(sauda.quantity) ? 'delivered' : 'partial';

        saudaUpdates.push({
          updateOne: {
            filter: { _id: sauda._id },
            update: { delivered: newDelivered, returnedFine: newReturnedFine, status: newStatus, updatedBy: req.user._id }
          }
        });

        invoiceSaudaRecords.push({
          invoiceId: invoice._id,
          saudaId: sauda._id,
          weight: fineToUse,
          fine: fineToUse,
          createdBy: req.user._id
        });

        remainingFine -= fineToUse;
      }
    }

    let createdPuggas = [];
    if (isReturn !== true) {
      // Parallel: create bhavcut sauda + insert puggas
      const [bhavcutSauda, insertedPuggas] = await Promise.all([
        hasBhavcut ? Sauda.create({
          saudaNo,
          partyId,
          saudaDate: invoiceDate,
          quantity: bhavcut.weight,
          delivered: bhavcut.weight,
          rate: bhavcut.rate,
          saudaType: 'purchase',
          saudaCategory: 'kachi',
          isBhavCut: false,
          status: 'delivered',
          createdBy: req.user._id
        }) : Promise.resolve(null),
        (paggaItems && Array.isArray(paggaItems) && paggaItems.length > 0)
          ? Pugga.insertMany(paggaItems.map(item => ({
              paggaNo: item.paggaNo,
              weight: item.weight,
              touch: item.touch,
              remark: item.remark,
              invoiceId: invoice._id,
              isDukanStock: false,
              createdBy: req.user._id
            })))
          : Promise.resolve([])
      ]);

      createdPuggas = insertedPuggas;
      totalFine = createdPuggas.reduce((sum, p) => sum + roundToHalf((Number(p.weight) * Number(p.touch)) / 100), 0);

      const saudas = await Sauda.find({
        partyId,
        saudaType: 'purchase',
        status: { $in: ['pending', 'partial'] },
        isDeleted: false
      }).sort({ saudaDate: 1 }).lean();

      if (bhavcutSauda) {
        saudas.unshift(bhavcutSauda.toObject());
      }

      let remainingFine = totalFine;
      for (const sauda of saudas) {
        if (remainingFine <= 0) break;

        const saudaRemainingQty = sauda.quantity - sauda.delivered;
        if (saudaRemainingQty <= 0) continue;

        const fineToUse = roundToHalf(Math.min(remainingFine, saudaRemainingQty));
        const newDelivered = sauda.delivered + fineToUse;
        const newStatus = newDelivered >= sauda.quantity ? 'delivered' : 'partial';

        saudaUpdates.push({
          updateOne: {
            filter: { _id: sauda._id },
            update: { delivered: newDelivered, status: newStatus, updatedBy: req.user._id }
          }
        });

        invoiceSaudaRecords.push({
          invoiceId: invoice._id,
          saudaId: sauda._id,
          weight: fineToUse,
          fine: fineToUse,
          createdBy: req.user._id
        });

        remainingFine -= fineToUse;
      }

      if (bhavcutSauda) {
        invoiceSaudaRecords.push({
          invoiceId: invoice._id,
          saudaId: bhavcutSauda._id,
          weight: bhavcut.weight,
          fine: bhavcut.weight,
          createdBy: req.user._id
        });
      }
    } else {
      if (puggaIds && Array.isArray(puggaIds) && puggaIds.length > 0) {
        await Pugga.updateMany(
          { _id: { $in: puggaIds } },
          { returnInvoiceId: invoice._id, isPurchaseReturn: true, updatedBy: req.user._id }
        );
        createdPuggas = await Pugga.find({ _id: { $in: puggaIds } }).lean();
      }
    }

    // Parallel: bulk write saudas + insert invoice-sauda records
    const writeOps = [];
    if (saudaUpdates.length > 0) writeOps.push(Sauda.bulkWrite(saudaUpdates));
    if (invoiceSaudaRecords.length > 0) writeOps.push(InvoiceSauda.insertMany(invoiceSaudaRecords));
    if (writeOps.length > 0) await Promise.all(writeOps);

    const invoiceObj = invoice.toObject();
    invoiceObj.items = createdPuggas;
    invoiceObj.saudaDistribution = invoiceSaudaRecords;

    res.status(201).json({
      success: true,
      message: 'Invoice created successfully',
      data: { invoice: invoiceObj }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Error creating invoice', 
      error: error.message 
    });
  }
};

const getAllInvoices = async (req, res) => {
  try {
    const { partyId, startDate, endDate, page = 1, limit = 10 } = req.query;
    const filter = {   };
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
    
    const invoices = await Invoice.find(filter)
      .populate('partyId', 'partyName contactNo address email gstin')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);
    
    const total = await Invoice.countDocuments(filter);
    
    // Fetch puggas for each invoice (both normal and return invoices)
    const invoiceIds = invoices.map(inv => inv._id);
    const puggas = await Pugga.find({
      $or: [
        { invoiceId: { $in: invoiceIds } },
        { returnInvoiceId: { $in: invoiceIds } }
      ]
    });

    // Group puggas by invoiceId or returnInvoiceId (without population)
    const puggasByInvoice = {};
    puggas.forEach(pugga => {
      // Check each invoice ID and determine if it's a return invoice
      for (const invoiceId of invoiceIds) {
        const invoice = invoices.find(inv => inv._id.toString() === invoiceId.toString());
        if (!invoice) continue;

        // If invoice is return, group by returnInvoiceId
        if (invoice.isReturn && pugga.returnInvoiceId && pugga.returnInvoiceId.toString() === invoiceId.toString()) {
          const key = invoiceId.toString();
          if (!puggasByInvoice[key]) puggasByInvoice[key] = [];
          puggasByInvoice[key].push(pugga);
        }
        // If invoice is normal, group by invoiceId
        else if (!invoice.isReturn && pugga.invoiceId && pugga.invoiceId.toString() === invoiceId.toString()) {
          const key = invoiceId.toString();
          if (!puggasByInvoice[key]) puggasByInvoice[key] = [];
          puggasByInvoice[key].push(pugga);
        }
      }
    });

    // Populate invoice details after grouping
    const allPuggaIds = puggas.map(p => p._id);
    const populatedPuggas = await Pugga.find({ _id: { $in: allPuggaIds } })
      .populate('invoiceId', 'invoiceNo invoiceDate partyId')
      .populate('returnInvoiceId', 'invoiceNo invoiceDate partyId');

    // Rebuild puggasByInvoice with populated puggas
    const populatedPuggasByInvoice = {};
    puggas.forEach(pugga => {
      // Check each invoice ID and determine if it's a return invoice
      for (const invoiceId of invoiceIds) {
        const invoice = invoices.find(inv => inv._id.toString() === invoiceId.toString());
        if (!invoice) continue;

        // If invoice is return, group by returnInvoiceId
        if (invoice.isReturn && pugga.returnInvoiceId && pugga.returnInvoiceId.toString() === invoiceId.toString()) {
          const key = invoiceId.toString();
          if (!populatedPuggasByInvoice[key]) populatedPuggasByInvoice[key] = [];
          const populated = populatedPuggas.find(p => p._id.toString() === pugga._id.toString());
          if (populated) populatedPuggasByInvoice[key].push(populated);
        }
        // If invoice is normal, group by invoiceId
        else if (!invoice.isReturn && pugga.invoiceId && pugga.invoiceId.toString() === invoiceId.toString()) {
          const key = invoiceId.toString();
          if (!populatedPuggasByInvoice[key]) populatedPuggasByInvoice[key] = [];
          const populated = populatedPuggas.find(p => p._id.toString() === pugga._id.toString());
          if (populated) populatedPuggasByInvoice[key].push(populated);
        }
      }
    });

    // Add puggas to each invoice
    const invoicesWithPuggas = invoices.map(invoice => {
      const invoiceObj = invoice.toObject();
      const items = populatedPuggasByInvoice[invoice._id.toString()] || [];
      invoiceObj.items = items;
      return invoiceObj;
    });
    
    res.status(200).json({
      success: true,
      data: { 
        invoices: invoicesWithPuggas,
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
      message: 'Error fetching invoices', 
      error: error.message 
    });
  }
};

const getInvoiceById = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const invoice = await Invoice.findOne({ _id: req.params.id,   }).populate('partyId', 'partyName contactNo address email gstin');
    
    if (!invoice) {
      return res.status(404).json({ 
        success: false, 
        message: 'Invoice not found' 
      });
    }
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Fetch puggas for this invoice with pagination (both normal and return invoices)
    const puggas = await Pugga.find({
      $or: [
        { invoiceId: invoice._id },
        { returnInvoiceId: invoice._id }
      ]
    })
      .skip(skip)
      .limit(limitNum);

    const total = await Pugga.countDocuments({
      $or: [
        { invoiceId: invoice._id },
        { returnInvoiceId: invoice._id }
      ]
    });
    
    const invoiceObj = invoice.toObject();
    invoiceObj.items = puggas;
    invoiceObj.pagination = {
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      totalItems: total,
      itemsPerPage: limitNum
    };

    res.status(200).json({
      success: true,
      data: { invoice: invoiceObj }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching invoice', 
      error: error.message 
    });
  }
};

const updateInvoice = async (req, res) => {
  try {
    const { invoiceNo, partyId, invoiceDate, totalAmount, isActive, paggaItems, bhavcut } = req.body;

    const invoice = await Invoice.findByIdAndUpdate(
      req.params.id,
      { invoiceNo, partyId, invoiceDate, totalAmount, isActive, updatedBy: req.user._id },
      { new: true, runValidators: true }
    );

    // Create sauda from bhavcut data if provided
    let bhavcutSauda = null;
    if (bhavcut && bhavcut.weight > 0 && bhavcut.rate) {
      const saudaNo = await generateSaudaNo();
      bhavcutSauda = await Sauda.create({
        saudaNo,
        partyId: invoice.partyId,
        saudaDate: invoiceDate,
        quantity: bhavcut.weight,
        delivered: bhavcut.weight,
        rate: bhavcut.rate,
        saudaType: 'purchase',
        saudaCategory: 'kachi',
        isBhavCut: false,
        status: 'delivered',
        createdBy: req.user._id
      });
    }

    if (!invoice) {
      return res.status(404).json({ 
        success: false, 
        message: 'Invoice not found' 
      });
    }

    // Revert old sauda distributions
    const oldInvoiceSaudas = await InvoiceSauda.find({ invoiceId: invoice._id, isDeleted: false });
    for (const is of oldInvoiceSaudas) {
      const sauda = await Sauda.findById(is.saudaId);
      if (sauda) {
        const newDelivered = Math.max(0, sauda.delivered - is.weight);
        const newStatus = newDelivered <= 0 ? 'pending' : newDelivered >= sauda.quantity ? 'delivered' : 'partial';
        await Sauda.findByIdAndUpdate(is.saudaId, { delivered: newDelivered, status: newStatus });
      }
    }
    await InvoiceSauda.deleteMany({ invoiceId: invoice._id });

    // Get existing puggas for this invoice (skip for return invoices - their puggas are linked via returnInvoiceId)
    if (invoice.isReturn) {
      // For return invoices, only update returnInvoiceId puggas if provided
      if (paggaItems && Array.isArray(paggaItems)) {
        for (const item of paggaItems) {
          if (item._id) {
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
          }
        }
      }
    } else {
    const existingPuggas = await Pugga.find({ invoiceId: invoice._id,     });
    const existingPuggaIds = existingPuggas.map(p => p._id.toString());
    
    // Add new or update existing pugga items if provided
    if (paggaItems && Array.isArray(paggaItems)) {
      const providedPuggaIds = [];
      
      for (const item of paggaItems) {
        if (item._id) {
          // Update existing pugga
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
          // Insert new pugga
          await Pugga.create({
            paggaNo: item.paggaNo,
            weight: item.weight,
            touch: item.touch,
            remark: item.remark,
            invoiceId: invoice._id,
            createdBy: req.user._id
          });
        }
      }
      
      // Delete puggas that are not in the updated list
      const puggasToDelete = existingPuggaIds.filter(id => !providedPuggaIds.includes(id));
      if (puggasToDelete.length > 0) {
        await Pugga.deleteMany({ _id: { $in: puggasToDelete } });
      }
    } else {
      // If paggaItems is empty or not provided, delete all puggas for this invoice
      await Pugga.deleteMany({ invoiceId: invoice._id });
    }

    // Recalculate and redistribute sauda
    const updatedPuggas = await Pugga.find({ invoiceId: invoice._id });
    const totalFine = updatedPuggas.reduce((sum, p) => sum + roundToHalf((Number(p.weight) * Number(p.touch)) / 100), 0);

    if (totalFine > 0) {
      const saudas = await Sauda.find({
        partyId: invoice.partyId,
        saudaType: 'purchase',
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
          invoiceId: invoice._id,
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
          invoiceId: invoice._id,
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

    }

    res.status(200).json({
      success: true,
      message: 'Invoice updated successfully',
      data: { invoice }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error updating invoice', 
      error: error.message 
    });
  }
};

const deleteInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findByIdAndUpdate(
      req.params.id,
      { isDeleted: true, deletedBy: req.user._id },
      { new: true }
    );

    if (!invoice) {
      return res.status(404).json({ 
        success: false, 
        message: 'Invoice not found' 
      });
    }

    res.status(200).json({
      success: true,
      message: 'Invoice deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error deleting invoice', 
      error: error.message 
    });
  }
};

const getInvoiceSaudaReport = async (req, res) => {
  try {
    const { partyId, startDate, endDate, page = 1, limit = 10 } = req.query;
    const filter = { isDeleted: false };

    // Fetch all invoice-sauda links with populated data
    let invoiceSaudas = await InvoiceSauda.find(filter)
      .populate({
        path: 'invoiceId',
        select: 'invoiceNo invoiceDate partyId',
        populate: { path: 'partyId', select: 'partyName' }
      })
      .populate('saudaId', 'saudaNo saudaDate quantity delivered rate saudaType status')
      .sort({ createdAt: -1 });

    // Apply date filter
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      invoiceSaudas = invoiceSaudas.filter(is => {
        const invDate = new Date(is.invoiceId.invoiceDate);
        return invDate >= start && invDate <= end;
      });
    }

    // Group by party
    const partyMap = {};
    for (const is of invoiceSaudas) {
      if (!is.invoiceId || !is.invoiceId.partyId) continue;
      const pId = is.invoiceId.partyId._id.toString();
      const pName = is.invoiceId.partyId.partyName;

      if (partyId && pId !== partyId) continue;

      if (!partyMap[pId]) {
        partyMap[pId] = {
          partyId: pId,
          partyName: pName,
          totalWeight: 0,
          totalFine: 0,
          invoiceCount: 0,
          saudaCount: 0,
          invoices: {}
        };
      }

      const invId = is.invoiceId._id.toString();
      if (!partyMap[pId].invoices[invId]) {
        partyMap[pId].invoices[invId] = {
          invoiceId: invId,
          invoiceNo: is.invoiceId.invoiceNo,
          invoiceDate: is.invoiceId.invoiceDate,
          totalWeight: 0,
          totalFine: 0,
          saudaCuts: []
        };
        partyMap[pId].invoiceCount++;
      }

      partyMap[pId].invoices[invId].saudaCuts.push({
        saudaId: is.saudaId._id,
        saudaNo: is.saudaId.saudaNo,
        saudaDate: is.saudaId.saudaDate,
        quantity: is.saudaId.quantity,
        delivered: is.saudaId.delivered,
        rate: is.saudaId.rate,
        status: is.saudaId.status,
        weight: is.weight,
        fine: is.fine
      });

      partyMap[pId].invoices[invId].totalWeight += is.weight || 0;
      partyMap[pId].invoices[invId].totalFine += is.fine || 0;
      partyMap[pId].totalWeight += is.weight || 0;
      partyMap[pId].totalFine += is.fine || 0;
      partyMap[pId].saudaCount++;
    }

    // Convert to array and sort
    let parties = Object.values(partyMap);
    for (const p of parties) {
      p.invoices = Object.values(p.invoices).sort((a, b) => new Date(b.invoiceDate) - new Date(a.invoiceDate));
    }
    parties.sort((a, b) => b.totalFine - a.totalFine);

    // Paginate
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const total = parties.length;
    const paginatedParties = parties.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    res.status(200).json({
      success: true,
      data: {
        parties: paginatedParties,
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
      message: 'Error fetching invoice sauda report', 
      error: error.message 
    });
  }
};

module.exports = {
  createInvoice,
  getAllInvoices,
  getInvoiceById,
  updateInvoice,
  deleteInvoice,
  getInvoiceSaudaReport
};
