const Invoice = require('../models/Invoice.model');
const Pugga = require('../models/Pugga.model');
const SalesInvoice = require('../models/SalesInvoice.model');
const CompanyProfile = require('../models/CompanyProfile.model');
const Payment = require('../models/Payment.model');
const PhysicalStockVerification = require('../models/PhysicalStockVerification.model');
const MetalBadla = require('../models/MetalBadla.model');
const PakkiSalePurchase = require('../models/PakkiSalePurchase.model');
const { roundToHalf } = require('../utils/rounding.util');
const { calculateCurrentStock } = require('./pakkiSalePurchase.controller');

const calcFine = (puggas) => puggas.reduce((sum, p) => sum + roundToHalf((Number(p.weight) * Number(p.touch)) / 100), 0);

// Helper to calculate cash in hand as of a specific date
const calculateCashInHand = async (userId, targetDate) => {
  const endOfDate = new Date(targetDate);
  endOfDate.setHours(23, 59, 59, 999);

  const companyProfile = await CompanyProfile.findOne({ userId, isDeleted: false }).lean();
  const openingBalance = companyProfile ? Number(companyProfile.openingBalance) || 0 : 0;

  const latestVerification = await PhysicalStockVerification.findOne({
    isDeleted: false,
    physicalBalance: { $gt: 0 },
    date: { $lte: endOfDate }
  }).sort({ date: -1, createdAt: -1 }).lean();

  let startBalance = openingBalance;
  let paymentFilter = { isActive: true, isDeleted: false, paymentDate: { $lte: endOfDate } };

  if (latestVerification) {
    startBalance = Number(latestVerification.physicalBalance) || 0;
    
    const verificationMidnight = new Date(latestVerification.date);
    verificationMidnight.setHours(0, 0, 0, 0);
    const verificationMidnightEnd = new Date(verificationMidnight);
    verificationMidnightEnd.setHours(23, 59, 59, 999);

    paymentFilter = {
      isActive: true,
      isDeleted: false,
      $and: [
        { paymentDate: { $lte: endOfDate } },
        {
          $or: [
            { paymentDate: { $gt: verificationMidnightEnd } },
            {
              paymentDate: { $gte: verificationMidnight, $lte: verificationMidnightEnd },
              createdAt: { $gt: latestVerification.createdAt }
            }
          ]
        }
      ]
    };
  }

  const payments = await Payment.aggregate([
    { $match: paymentFilter },
    { $group: { _id: '$paymentType', total: { $sum: '$amount' } } }
  ]);

  const incomingAmount = payments.find(p => p._id === 'incoming')?.total || 0;
  const outgoingAmount = payments.find(p => p._id === 'outgoing')?.total || 0;

  return startBalance + incomingAmount - outgoingAmount;
};

// Helper to calculate Kachi Stock (puggas count & fine) as of a specific date
const calculateKachiStock = async (targetDate) => {
  const endOfDate = new Date(targetDate);
  endOfDate.setHours(23, 59, 59, 999);

  // Invoices (Purchase Kachi)
  const purchases = await Invoice.find({ isDeleted: false, isReturn: false, invoiceDate: { $lte: endOfDate } }).select('_id').lean();
  const purchaseIds = purchases.map(p => p._id);

  // Metal Badlas (Exchange Kachi)
  const badlas = await MetalBadla.find({ isDeleted: false, date: { $lte: endOfDate } }).select('paggaIds').lean();
  const badlaPuggaIds = badlas.reduce((acc, b) => acc.concat(b.paggaIds || []), []);

  // Created puggas
  const createdPuggas = await Pugga.find({
    isDeleted: false,
    $or: [
      { invoiceId: { $in: purchaseIds } },
      { _id: { $in: badlaPuggaIds } }
    ]
  }).lean();

  // Sold puggas (Sales Kachi)
  const salesInvoices = await SalesInvoice.find({ isDeleted: false, isReturn: false, invoiceDate: { $lte: endOfDate } }).select('paggaIds').lean();
  const soldPuggaIds = new Set(salesInvoices.reduce((acc, s) => acc.concat((s.paggaIds || []).map(id => id.toString())), []));

  // Remaining puggas in stock
  const remainingPuggas = createdPuggas.filter(p => !soldPuggaIds.has(p._id.toString()));

  return {
    totalPuggas: remainingPuggas.length,
    totalFine: calcFine(remainingPuggas)
  };
};

const getDashboard = async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date ? new Date(date) : new Date();

    const todayStart = new Date(targetDate);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(targetDate);
    todayEnd.setHours(23, 59, 59, 999);

    const yesterdayDate = new Date(todayStart);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);

    // Queries for today's transactions
    const [
      todayPurchases,
      todaySales,
      todayBadlas,
      todayPakki,
      chorsaStockToday,
      chorsaStockYesterday,
      bankStockToday,
      bankStockYesterday,
      cashInHandToday,
      cashInHandYesterday,
      kachiStockToday,
      kachiStockYesterday
    ] = await Promise.all([
      // Kachi Purchases
      Invoice.find({ isDeleted: false, isReturn: false, invoiceDate: { $gte: todayStart, $lte: todayEnd } }).select('_id').lean(),
      // Kachi Sales
      SalesInvoice.find({ isDeleted: false, isReturn: false, invoiceDate: { $gte: todayStart, $lte: todayEnd } }).select('paggaIds').lean(),
      // Metal Exchange
      MetalBadla.find({ isDeleted: false, date: { $gte: todayStart, $lte: todayEnd } }).lean(),
      // Pakki transactions
      PakkiSalePurchase.find({ isDeleted: false, date: { $gte: todayStart, $lte: todayEnd } }).lean(),
      // Stocks
      calculateCurrentStock(req.user._id, 'chorsa-999', targetDate),
      calculateCurrentStock(req.user._id, 'chorsa-999', yesterdayDate),
      calculateCurrentStock(req.user._id, 'bank-9999', targetDate),
      calculateCurrentStock(req.user._id, 'bank-9999', yesterdayDate),
      calculateCashInHand(req.user._id, targetDate),
      calculateCashInHand(req.user._id, yesterdayDate),
      calculateKachiStock(targetDate),
      calculateKachiStock(yesterdayDate)
    ]);

    // Calculate Today's Kachi Purchases Weight & Fine
    const todayPurchaseIds = todayPurchases.map(p => p._id);
    const todayPurchasePuggas = todayPurchaseIds.length > 0 
      ? await Pugga.find({ invoiceId: { $in: todayPurchaseIds }, isDeleted: false }).lean()
      : [];
    const kachiPurchaseWeight = todayPurchasePuggas.reduce((sum, p) => sum + (Number(p.weight) || 0), 0);
    const kachiPurchaseFine = calcFine(todayPurchasePuggas);

    // Calculate Today's Kachi Sales Weight & Fine
    const todaySalesPaggaIds = todaySales.reduce((acc, s) => acc.concat(s.paggaIds || []), []);
    const todaySalesPuggas = todaySalesPaggaIds.length > 0
      ? await Pugga.find({ _id: { $in: todaySalesPaggaIds }, isDeleted: false }).lean()
      : [];
    const kachiSellWeight = todaySalesPuggas.reduce((sum, p) => sum + (Number(p.weight) || 0), 0);
    const kachiSellFine = calcFine(todaySalesPuggas);

    // Calculate Today's Metal Exchange
    const todayBadlaPaggaIds = todayBadlas.reduce((acc, b) => acc.concat(b.paggaIds || []), []);
    const todayBadlaPuggas = todayBadlaPaggaIds.length > 0
      ? await Pugga.find({ _id: { $in: todayBadlaPaggaIds }, isDeleted: false }).lean()
      : [];
    const exchangeKachiWeight = todayBadlaPuggas.reduce((sum, p) => sum + (Number(p.weight) || 0), 0);
    const exchangeKachiFine = todayBadlas.reduce((sum, b) => sum + (Number(b.totalFine) || 0), 0);
    const exchangeBadlaWeight = todayBadlas.reduce((sum, b) => sum + (Number(b.requiredSilver) || 0), 0);
    const exchangeGivenSilver = todayBadlas.reduce((sum, b) => sum + (Number(b.givenSilver) || 0), 0);

    // Calculate Today's Pakki transactions
    const chorsaBuyWeight = todayPakki.filter(r => r.chorsaType === 'chorsa-999' && r.type === 'buy').reduce((sum, r) => sum + (Number(r.weight) || 0), 0);
    const chorsaSellWeight = todayPakki.filter(r => r.chorsaType === 'chorsa-999' && r.type === 'sell').reduce((sum, r) => sum + (Number(r.weight) || 0), 0);
    const bankBuyWeight = todayPakki.filter(r => r.chorsaType === 'bank-9999' && r.type === 'buy').reduce((sum, r) => sum + (Number(r.weight) || 0), 0);
    const bankSellWeight = todayPakki.filter(r => r.chorsaType === 'bank-9999' && r.type === 'sell').reduce((sum, r) => sum + (Number(r.weight) || 0), 0);

    res.status(200).json({
      success: true,
      data: {
        date: targetDate.toISOString().split('T')[0],
        kachi: {
          purchaseWeight: kachiPurchaseWeight,
          purchaseFine: kachiPurchaseFine,
          sellWeight: kachiSellWeight,
          sellFine: kachiSellFine
        },
        exchange: {
          kachiWeight: exchangeKachiWeight,
          kachiFine: exchangeKachiFine,
          badlaWeight: exchangeBadlaWeight,
          givenSilver: exchangeGivenSilver
        },
        chorsa: {
          buyWeight: chorsaBuyWeight,
          sellWeight: chorsaSellWeight,
          stockToday: chorsaStockToday,
          stockYesterday: chorsaStockYesterday
        },
        bank: {
          buyWeight: bankBuyWeight,
          sellWeight: bankSellWeight,
          stockToday: bankStockToday,
          stockYesterday: bankStockYesterday
        },
        cashInHand: {
          today: cashInHandToday,
          yesterday: cashInHandYesterday
        },
        kachiStock: {
          todayPuggas: kachiStockToday.totalPuggas,
          todayFine: kachiStockToday.totalFine,
          yesterdayPuggas: kachiStockYesterday.totalPuggas,
          yesterdayFine: kachiStockYesterday.totalFine
        }
      }
    });
  } catch (error) {
    console.error('Error generating dashboard data:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating dashboard data',
      error: error.message
    });
  }
};

module.exports = {
  getDashboard,
  calculateCashInHand
};
