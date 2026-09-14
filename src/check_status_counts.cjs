const mongoose = require('mongoose');
const SalesInvoice = require('./models/SalesInvoice.model');

mongoose.connect('mongodb://127.0.0.1:27017/br-bullian')
  .then(async () => {
    const partyId = '6a0b4b4485d384e22b982d0b'; // Sushil Ji
    
    const unpaidCount = await SalesInvoice.countDocuments({ partyId, isDeleted: false, paymentStatus: 'unpaid' });
    const partialCount = await SalesInvoice.countDocuments({ partyId, isDeleted: false, paymentStatus: 'partial' });
    const paidCount = await SalesInvoice.countDocuments({ partyId, isDeleted: false, paymentStatus: 'paid' });
    const noStatusCount = await SalesInvoice.countDocuments({ partyId, isDeleted: false, paymentStatus: { $exists: false } });
    
    console.log('Unpaid:', unpaidCount);
    console.log('Partial:', partialCount);
    console.log('Paid:', paidCount);
    console.log('No Status:', noStatusCount);
    
    process.exit(0);
  });
