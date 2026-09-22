const Invoice = require('../models/Invoice.model');
const SalesInvoice = require('../models/SalesInvoice.model');
const Pugga = require('../models/Pugga.model');
const MetalBadla = require('../models/MetalBadla.model');
const PakkiSalePurchase = require('../models/PakkiSalePurchase.model');
const Party = require('../models/Party.model');
const { roundToHalf } = require('../utils/rounding.util');

// Generate Report Summary Grouped by Party for a Selected Date
const getReportSummary = async (req, res) => {
  try {
    const { date, partyId } = req.query;

    // Default to today if date is not selected
    let targetDateStr;
    if (date) {
      targetDateStr = date;
    } else {
      const offset = 5.5 * 60 * 60 * 1000;
      targetDateStr = new Date(Date.now() + offset).toISOString().split('T')[0];
    }

    const start = new Date(`${targetDateStr}T00:00:00.000Z`);
    const end = new Date(`${targetDateStr}T23:59:59.999Z`);

    const queryFilter = {
      isDeleted: false
    };

    const dateFilter = {
      $gte: start,
      $lte: end
    };

    // 1. Fetch Party List for mapping names
    const parties = await Party.find({ isDeleted: false }).select('partyName').lean();
    const partyMap = {};
    parties.forEach(p => {
      partyMap[p._id.toString()] = p.partyName;
    });

    // 2. Fetch Kachi Purchases (Invoice)
    const purchaseFilter = { ...queryFilter, invoiceDate: dateFilter, isReturn: false };
    if (partyId) purchaseFilter.partyId = partyId;
    const purchases = await Invoice.find(purchaseFilter).lean();
    const purchaseIds = purchases.map(p => p._id);
    const purchasePuggas = await Pugga.find({ invoiceId: { $in: purchaseIds }, isDeleted: false }).lean();
    const purchasePuggaMap = {};
    purchasePuggas.forEach(p => {
      if (!purchasePuggaMap[p.invoiceId.toString()]) {
        purchasePuggaMap[p.invoiceId.toString()] = [];
      }
      purchasePuggaMap[p.invoiceId.toString()].push(p);
    });

    // 3. Fetch Kachi Sales (SalesInvoice)
    const salesFilter = { ...queryFilter, invoiceDate: dateFilter, isReturn: false };
    if (partyId) salesFilter.partyId = partyId;
    const salesInvoices = await SalesInvoice.find(salesFilter).lean();
    const allSalesPaggaIds = salesInvoices.reduce((acc, s) => acc.concat(s.paggaIds || []), []);
    const salesPuggas = await Pugga.find({ _id: { $in: allSalesPaggaIds }, isDeleted: false }).lean();
    const salesPuggaMap = {};
    salesPuggas.forEach(p => {
      salesPuggaMap[p._id.toString()] = p;
    });

    // 4. Fetch Metal Badlas
    const badlaFilter = { ...queryFilter, date: dateFilter };
    if (partyId) badlaFilter.partyId = partyId;
    const badlas = await MetalBadla.find(badlaFilter).lean();
    const allBadlaPuggaIds = badlas.reduce((acc, b) => acc.concat(b.paggaIds || []), []);
    const badlaPuggas = await Pugga.find({ _id: { $in: allBadlaPuggaIds }, isDeleted: false }).lean();
    const badlaPuggaMap = {};
    badlaPuggas.forEach(p => {
      badlaPuggaMap[p._id.toString()] = p;
    });

    // 5. Fetch Pakki Sales/Purchases (Chorsa/Bank)
    const pakkiFilter = { ...queryFilter, date: dateFilter };
    if (partyId) pakkiFilter.partyId = partyId;
    const pakkiRecords = await PakkiSalePurchase.find(pakkiFilter).lean();

    // Map compiled results by partyId (only one entry per party)
    const reportData = {};

    const initializeRow = (pId) => {
      if (!reportData[pId]) {
        reportData[pId] = {
          partyId: pId,
          partyName: partyMap[pId] || 'Unknown Party',
          kachiBuyWeight: 0,
          kachiBuyFine: 0,
          kachiSellWeight: 0,
          kachiSellFine: 0,
          exchangeKachiWeight: 0,
          exchangeKachiFine: 0,
          exchangeBadlaWeight: 0,
          exchangeGivenSilver: 0,
          chorsaBuyWeight: 0,
          chorsaSellWeight: 0,
          bankBuyWeight: 0,
          bankSellWeight: 0
        };
      }
      return pId;
    };

    // Aggregate Kachi Purchases
    purchases.forEach(inv => {
      const pId = inv.partyId.toString();
      const key = initializeRow(pId);
      const items = purchasePuggaMap[inv._id.toString()] || [];
      const weight = items.reduce((sum, item) => sum + (Number(item.weight) || 0), 0);
      const fine = items.reduce((sum, item) => sum + ((Number(item.weight) || 0) * (Number(item.touch) || 0) / 100), 0);
      reportData[key].kachiBuyWeight += weight;
      reportData[key].kachiBuyFine += fine;
    });

    // Aggregate Kachi Sales
    salesInvoices.forEach(inv => {
      const pId = inv.partyId.toString();
      const key = initializeRow(pId);
      const items = (inv.paggaIds || []).map(id => salesPuggaMap[id.toString()]).filter(Boolean);
      const weight = items.reduce((sum, item) => sum + (Number(item.weight) || 0), 0);
      const fine = items.reduce((sum, item) => sum + ((Number(item.weight) || 0) * (Number(item.touch) || 0) / 100), 0);
      reportData[key].kachiSellWeight += weight;
      reportData[key].kachiSellFine += fine;
    });

    // Aggregate Metal Badla (Exchange)
    badlas.forEach(b => {
      const pId = b.partyId.toString();
      const key = initializeRow(pId);
      const items = (b.paggaIds || []).map(id => badlaPuggaMap[id.toString()]).filter(Boolean);
      const kachiWeight = items.reduce((sum, item) => sum + (Number(item.weight) || 0), 0);
      
      reportData[key].exchangeKachiWeight += kachiWeight;
      reportData[key].exchangeKachiFine += Number(b.totalFine) || 0;
      reportData[key].exchangeBadlaWeight += Number(b.requiredSilver) || 0; // requiredSilver is already palta weight
      reportData[key].exchangeGivenSilver += Number(b.givenSilver) || 0;
    });

    // Aggregate Pakki records
    pakkiRecords.forEach(r => {
      const pId = r.partyId.toString();
      const key = initializeRow(pId);
      const weight = Number(r.weight) || 0;
      if (r.chorsaType === 'bank-9999') {
        if (r.type === 'buy') reportData[key].bankBuyWeight += weight;
        else reportData[key].bankSellWeight += weight;
      } else {
        if (r.type === 'buy') reportData[key].chorsaBuyWeight += weight;
        else reportData[key].chorsaSellWeight += weight;
      }
    });

    // Transform map to sorted list (alphabetically by party name)
    const records = Object.values(reportData).sort((a, b) => a.partyName.localeCompare(b.partyName));

    res.status(200).json({
      success: true,
      data: {
        date: targetDateStr,
        records,
        partyTotals: records // Same since it's already grouped by party for that date
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error generating report summary',
      error: error.message
    });
  }
};

// Daily stock report: aggregates Kachi fine, Chorsa, Bank per day
const getDailyStockReport = async (req, res) => {
  try {
    const { start, end } = req.query;
    const startDate = start ? new Date(start) : new Date();
    const endDate = end ? new Date(end) : new Date();
    startDate.setHours(0,0,0,0);
    endDate.setHours(23,59,59,999);

    // Kachi stock (unsold) up to endDate
    const purchases = await Invoice.find({ isDeleted: false, isReturn: false, invoiceDate: { $lte: endDate } })
      .select('_id invoiceDate')
      .lean();
    const purchaseIds = purchases.map(p => p._id);
    const badlas = await MetalBadla.find({ isDeleted: false, date: { $lte: endDate } })
      .select('paggaIds date')
      .lean();
    const badlaPuggaIds = badlas.flatMap(b => b.paggaIds || []);
    const createdPuggas = await Pugga.find({
      isDeleted: false,
      $or: [
        { invoiceId: { $in: purchaseIds } },
        { _id: { $in: badlaPuggaIds } }
      ]
    }).lean();

    const salesInvoices = await SalesInvoice.find({ isDeleted: false, isReturn: false, invoiceDate: { $lte: endDate } })
      .select('paggaIds')
      .lean();
    const soldPuggaIds = new Set(salesInvoices.flatMap(si => si.paggaIds || []).map(id => id.toString()));
    const remainingPuggas = createdPuggas.filter(p => !soldPuggaIds.has(p._id.toString()));

    const kachiEntries = remainingPuggas.map(p => {
      let entryDate = p.createdAt;
      if (p.invoiceId) {
        const inv = purchases.find(i => i._id.toString() === p.invoiceId.toString());
        if (inv && inv.invoiceDate) entryDate = inv.invoiceDate;
      } else if (badlaPuggaIds.includes(p._id)) {
        const mb = badlas.find(b => (b.paggaIds || []).some(id => id.toString() === p._id.toString()));
        if (mb && mb.date) entryDate = mb.date;
      }
      const fine = roundToHalf((Number(p.weight) * Number(p.touch)) / 100);
      return { date: entryDate, fine };
    });

    const kachiMap = {};
    kachiEntries.forEach(e => {
      const ds = new Date(e.date).toISOString().split('T')[0];
      kachiMap[ds] = (kachiMap[ds] || 0) + e.fine;
    });

    // Pakki records (Chorsa / Bank)
    const pakkiFilter = { isDeleted: false, date: { $gte: startDate, $lte: endDate } };
    const pakkiRecords = await PakkiSalePurchase.find(pakkiFilter).lean();
    const pakkiMap = {};
    pakkiRecords.forEach(r => {
      const ds = new Date(r.date).toISOString().split('T')[0];
      if (!pakkiMap[ds]) pakkiMap[ds] = { chorsa: 0, bank: 0 };
      const w = Number(r.weight) || 0;
      if (r.chorsaType === 'bank-9999') {
        pakkiMap[ds].bank += r.type === 'buy' ? w : -w;
      } else {
        pakkiMap[ds].chorsa += r.type === 'buy' ? w : -w;
      }
    });

    const allDates = new Set([...Object.keys(kachiMap), ...Object.keys(pakkiMap)]);
    const report = Array.from(allDates).sort().map(ds => ({
      date: ds,
      kachiFine: kachiMap[ds] || 0,
      chorsaStock: (pakkiMap[ds] && pakkiMap[ds].chorsa) || 0,
      bankStock: (pakkiMap[ds] && pakkiMap[ds].bank) || 0
    }));

    res.status(200).json({ success: true, data: report });
  } catch (error) {
    console.error('Error generating daily stock report:', error);
    res.status(500).json({ success: false, message: 'Error generating daily stock report', error: error.message });
  }
};

module.exports = {
  getReportSummary,
  getDailyStockReport,
};
