const mongoose = require('mongoose');
const Party = require('./models/Party.model');
const SalesInvoice = require('./models/SalesInvoice.model');
const Invoice = require('./models/Invoice.model');
const Payment = require('./models/Payment.model');

mongoose.connect('mongodb://127.0.0.1:27017/br-bullian')
  .then(async () => {
    console.log('Connected to DB');
    
    const parties = await Party.find({ isActive: true, isDeleted: false }).lean();
    console.log(`Found ${parties.length} active parties.`);

    const receivables = [];
    const payables = [];

    for (const party of parties) {
      const salesInvoices = await SalesInvoice.find({
        partyId: party._id,
        isDeleted: false,
        paymentStatus: { $ne: 'paid' }
      }).lean();

      const incomingAdvances = await Payment.find({
        partyId: party._id,
        paymentType: 'incoming',
        isDeleted: false,
        advanceRemaining: { $gt: 0 }
      }).lean();

      let totalSalesPending = 0;
      salesInvoices.forEach(inv => {
        totalSalesPending += (inv.totalAmount || 0) - (inv.paidAmount || 0);
      });

      const totalIncomingAdvance = incomingAdvances.reduce((sum, p) => sum + (p.advanceRemaining || 0), 0);

      if (totalSalesPending > 0 || totalIncomingAdvance > 0) {
        receivables.push({
          partyName: party.partyName,
          totalSalesPending,
          totalIncomingAdvance
        });
      }
    }

    console.log('Receivables count:', receivables.length);
    console.log('Sample receivables:', receivables.slice(0, 5));
    process.exit(0);
  });
