const Invoice = require('../models/Invoice.model');

const generateInvoiceNo = async () => {
  try {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    
    // Find the last invoice for this day
    const lastInvoice = await Invoice.findOne({
      invoiceNo: new RegExp(`^INV-${year}-${month}-${day}`)
    }).sort({ invoiceNo: -1 });

    let sequence = 1;
    if (lastInvoice) {
      const lastSequence = parseInt(lastInvoice.invoiceNo.split('-')[4]);
      sequence = lastSequence + 1;
    }

    const invoiceNo = `INV-${year}-${month}-${day}-${String(sequence).padStart(4, '0')}`;
    return invoiceNo;
  } catch (error) {
    console.error('Error generating invoice number:', error);
    return `INV-${Date.now()}`;
  }
};

module.exports = { generateInvoiceNo };
