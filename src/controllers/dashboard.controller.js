const Invoice = require('../models/Invoice.model');
const Pugga = require('../models/Pugga.model');
const SalesInvoice = require('../models/SalesInvoice.model');
const { roundToHalf } = require('../utils/rounding.util');

const getDashboard = async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Stock Puggas (unsold, active, not deleted)
    const stockPuggas = await Pugga.find({ isSold: false, isDukanStock: false, isActive: true, isDeleted: false });
    const totalStockPuggas = stockPuggas.length;
    const totalStockFine = stockPuggas.reduce((sum, p) => sum + roundToHalf((Number(p.weight) * Number(p.touch)) / 100), 0);

    // Dukan Stock
    const dukanStockPuggas = await Pugga.find({ isDukanStock: true, isActive: true, isDeleted: false });
    const totalDukanStockPuggas = dukanStockPuggas.length;
    const totalDukanStockFine = dukanStockPuggas.reduce((sum, p) => sum + roundToHalf((Number(p.weight) * Number(p.touch)) / 100), 0);

    // Incoming Invoices (today only)
    const incomingInvoices = await Invoice.find({
      isActive: true,
      isDeleted: false,
      invoiceDate: { $gte: todayStart, $lte: todayEnd }
    });
    const totalIncomingInvoices = incomingInvoices.length;
    const incomingInvoiceIds = incomingInvoices.map(inv => inv._id);

    const incomingPuggas = await Pugga.find({ invoiceId: { $in: incomingInvoiceIds }, isActive: true, isDeleted: false });
    const totalIncomingPuggas = incomingPuggas.length;
    const totalIncomingFine = incomingPuggas.reduce((sum, p) => sum + roundToHalf((Number(p.weight) * Number(p.touch)) / 100), 0);

    // Sales Invoices (today only)
    const salesInvoices = await SalesInvoice.find({
      isActive: true,
      isDeleted: false,
      invoiceDate: { $gte: todayStart, $lte: todayEnd }
    });
    const totalSalesInvoices = salesInvoices.length;
    const salesPaggaIds = salesInvoices.reduce((ids, si) => ids.concat(si.paggaIds), []);

    const salesPuggas = await Pugga.find({ _id: { $in: salesPaggaIds }, isActive: true, isDeleted: false });
    const totalSalesPuggas = salesPuggas.length;
    const totalSalesFine = salesPuggas.reduce((sum, p) => sum + roundToHalf((Number(p.weight) * Number(p.touch)) / 100), 0);

    res.status(200).json({
      success: true,
      data: {
        stock: {
          totalPuggas: totalStockPuggas,
          totalFine: totalStockFine
        },
        dukanStock: {
          totalPuggas: totalDukanStockPuggas,
          totalFine: totalDukanStockFine
        },
        incoming: {
          totalInvoices: totalIncomingInvoices,
          totalPuggas: totalIncomingPuggas,
          totalFine: totalIncomingFine
        },
        sales: {
          totalInvoices: totalSalesInvoices,
          totalPuggas: totalSalesPuggas,
          totalFine: totalSalesFine
        }
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching dashboard data', 
      error: error.message 
    });
  }
};

module.exports = { getDashboard };
