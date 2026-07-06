const Invoice = require('../models/Invoice.model');
const Pugga = require('../models/Pugga.model');
const SalesInvoice = require('../models/SalesInvoice.model');
const CompanyProfile = require('../models/CompanyProfile.model');
const Payment = require('../models/Payment.model');
const { roundToHalf } = require('../utils/rounding.util');

const calcFine = (puggas) => puggas.reduce((sum, p) => sum + roundToHalf((Number(p.weight) * Number(p.touch)) / 100), 0);

const getDashboard = async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Round 1: All independent queries in parallel
    const [
      stockPuggas,
      dukanStockPuggas,
      incomingInvoices,
      todaySalesInvoices,
      allIncomingInvoices,
      allSalesInvoices,
      companyProfile,
      paymentAgg
    ] = await Promise.all([
      Pugga.find({ isSold: false, isDukanStock: false, isActive: true, isDeleted: false }).select('weight touch').lean(),
      Pugga.find({ isDukanStock: true, isActive: true, isDeleted: false }).select('weight touch').lean(),
      Invoice.find({ isActive: true, isDeleted: false, invoiceDate: { $gte: todayStart, $lte: todayEnd } }).select('_id').lean(),
      SalesInvoice.find({ isActive: true, isDeleted: false, invoiceDate: { $gte: todayStart, $lte: todayEnd } }).select('paggaIds').lean(),
      Invoice.find({ isDeleted: { $ne: true } }).select('_id isReturn').lean(),
      SalesInvoice.find({ isDeleted: { $ne: true } }).select('paggaIds isReturn').lean(),
      CompanyProfile.findOne({ userId: req.user._id, isDeleted: { $ne: true } }).select('openingBalance openingFine').lean(),
      Payment.aggregate([
        { $match: { isActive: true, isDeleted: false } },
        { $group: { _id: '$paymentType', total: { $sum: '$amount' } } }
      ])
    ]);

    // Process Round 1 results
    const totalStockPuggas = stockPuggas.length;
    const totalStockFine = calcFine(stockPuggas);

    const totalDukanStockPuggas = dukanStockPuggas.length;
    const totalDukanStockFine = calcFine(dukanStockPuggas);

    const totalIncomingInvoices = incomingInvoices.length;
    const incomingInvoiceIds = incomingInvoices.map(inv => inv._id);

    const totalSalesInvoices = todaySalesInvoices.length;
    const todaySalesPaggaIds = todaySalesInvoices.reduce((ids, si) => ids.concat(si.paggaIds), []);

    const purchaseInvoiceIds = allIncomingInvoices.filter(inv => !inv.isReturn).map(inv => inv._id);
    const purchaseReturnInvoiceIds = allIncomingInvoices.filter(inv => inv.isReturn).map(inv => inv._id);

    const allSalesPaggaIds = allSalesInvoices.filter(si => !si.isReturn).reduce((ids, si) => ids.concat(si.paggaIds), []);
    const allSalesReturnPaggaIds = allSalesInvoices.filter(si => si.isReturn).reduce((ids, si) => ids.concat(si.paggaIds), []);

    const openingBalance = companyProfile ? Number(companyProfile.openingBalance) || 0 : 0;
    const openingFine = companyProfile ? Number(companyProfile.openingFine) || 0 : 0;

    const incomingAmount = paymentAgg.find(p => p._id === 'incoming')?.total || 0;
    const outgoingAmount = paymentAgg.find(p => p._id === 'outgoing')?.total || 0;

    // Round 2: All dependent pugga queries in parallel
    const [
      incomingPuggas,
      todaySalesPuggas,
      purchasePuggas,
      purchaseReturnPuggas,
      salesAllPuggas,
      salesReturnAllPuggas
    ] = await Promise.all([
      incomingInvoiceIds.length > 0
        ? Pugga.find({ invoiceId: { $in: incomingInvoiceIds }, isActive: true, isDeleted: false }).select('weight touch').lean()
        : [],
      todaySalesPaggaIds.length > 0
        ? Pugga.find({ _id: { $in: todaySalesPaggaIds }, isActive: true, isDeleted: false }).select('weight touch').lean()
        : [],
      purchaseInvoiceIds.length > 0
        ? Pugga.find({ invoiceId: { $in: purchaseInvoiceIds }, isDeleted: { $ne: true } }).select('weight touch').lean()
        : [],
      purchaseReturnInvoiceIds.length > 0
        ? Pugga.find({ returnInvoiceId: { $in: purchaseReturnInvoiceIds }, isDeleted: { $ne: true } }).select('weight touch').lean()
        : [],
      allSalesPaggaIds.length > 0
        ? Pugga.find({ _id: { $in: allSalesPaggaIds }, isDeleted: { $ne: true } }).select('weight touch').lean()
        : [],
      allSalesReturnPaggaIds.length > 0
        ? Pugga.find({ _id: { $in: allSalesReturnPaggaIds }, isDeleted: { $ne: true } }).select('weight touch').lean()
        : []
    ]);

    // Calculate fines
    const totalIncomingPuggas = incomingPuggas.length;
    const totalIncomingFine = calcFine(incomingPuggas);
    const totalSalesPuggas = todaySalesPuggas.length;
    const totalSalesFine = calcFine(todaySalesPuggas);
    const totalPurchaseFine = calcFine(purchasePuggas);
    const totalPurchaseReturnFine = calcFine(purchaseReturnPuggas);
    const totalSalesAllFine = calcFine(salesAllPuggas);
    const totalSalesReturnFine = calcFine(salesReturnAllPuggas);

    const cashInHand = openingBalance + incomingAmount - outgoingAmount;
    const cashInHandFine = openingFine + totalPurchaseFine - totalPurchaseReturnFine - totalSalesAllFine + totalSalesReturnFine;

    res.status(200).json({
      success: true,
      data: {
        cashInHand: {
          openingBalance,
          incomingAmount,
          outgoingAmount,
          balanceAmount: cashInHand,
          openingFine,
          balanceFine: cashInHandFine
        },
        stock: {
          totalPuggas: totalStockPuggas,
          totalFine: totalStockFine,
          openingFine,
          balanceFine: openingFine + totalStockFine
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
    console.log(error)
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching dashboard data', 
      error: error.message 
    });
  }
};

module.exports = { getDashboard };
