const mongoose = require('mongoose');
const SalesInvoice = require('./models/SalesInvoice.model');
const Invoice = require('./models/Invoice.model');
const Party = require('./models/Party.model');

mongoose.connect('mongodb://127.0.0.1:27017/br-bullian')
  .then(async () => {
    const parties = await Party.find({ isDeleted: false });
    console.log(`Checking ${parties.length} parties...`);
    let count = 0;
    for (const party of parties) {
      const sales = await SalesInvoice.countDocuments({ partyId: party._id, isDeleted: false, paymentStatus: 'unpaid' });
      const purchases = await Invoice.countDocuments({ partyId: party._id, isDeleted: false, paymentStatus: 'unpaid' });
      if (sales > 0 || purchases > 0) {
        console.log(`Party: ${party.partyName} (${party._id}) - Sales: ${sales}, Purchases: ${purchases}`);
        count++;
      }
    }
    console.log(`Total parties with unpaid invoices: ${count}`);
    process.exit(0);
  });
