const mongoose = require('mongoose');
const SalesInvoice = require('./models/SalesInvoice.model');
const Invoice = require('./models/Invoice.model');

mongoose.connect('mongodb://127.0.0.1:27017/br-bullian')
  .then(async () => {
    const partyId = '6a5a2fd80ee9c7b7c3b1ed70';
    console.log('Querying invoices for partyId:', partyId);
    
    const sales = await SalesInvoice.find({ partyId });
    const purchases = await Invoice.find({ partyId });
    
    console.log(`Sales Invoices count: ${sales.length}`);
    sales.forEach((inv, index) => {
      console.log(`Sales[${index}]: No=${inv.salesInvoiceNo}, totalAmount=${inv.totalAmount}, paidAmount=${inv.paidAmount}, paymentStatus=${inv.paymentStatus}, isDeleted=${inv.isDeleted}`);
    });

    console.log(`Purchase Invoices count: ${purchases.length}`);
    purchases.forEach((inv, index) => {
      console.log(`Purchase[${index}]: No=${inv.invoiceNo}, totalAmount=${inv.totalAmount}, paidAmount=${inv.paidAmount}, paymentStatus=${inv.paymentStatus}, isDeleted=${inv.isDeleted}`);
    });

    process.exit(0);
  });
