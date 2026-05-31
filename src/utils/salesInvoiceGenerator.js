const SalesInvoice = require('../models/SalesInvoice.model');

const generateSalesInvoiceNo = async () => {
  try {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    
    const lastInvoice = await SalesInvoice.findOne({
      salesInvoiceNo: new RegExp(`^SALE-${year}-${month}-${day}`)
    }).sort({ salesInvoiceNo: -1 });

    let sequence = 1;
    if (lastInvoice) {
      const lastSequence = parseInt(lastInvoice.salesInvoiceNo.split('-')[4]);
      sequence = lastSequence + 1;
    }

    const salesInvoiceNo = `SALE-${year}-${month}-${day}-${String(sequence).padStart(4, '0')}`;
    return salesInvoiceNo;
  } catch (error) {
    console.error('Error generating sales invoice number:', error);
    return `SALE-${Date.now()}`;
  }
};

module.exports = { generateSalesInvoiceNo };
