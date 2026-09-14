const mongoose = require('mongoose');
const SalesInvoice = require('./models/SalesInvoice.model');

mongoose.connect('mongodb://127.0.0.1:27017/br-bullian')
  .then(async () => {
    const stringId = '6a0b4b4485d384e22b982d0b'; // Sushil Ji
    
    const countWithString = await SalesInvoice.countDocuments({ partyId: stringId, isDeleted: false });
    const countWithObjectId = await SalesInvoice.countDocuments({ partyId: new mongoose.Types.ObjectId(stringId), isDeleted: false });
    
    console.log('Count with string:', countWithString);
    console.log('Count with ObjectId:', countWithObjectId);
    
    process.exit(0);
  });
