const PakkiSalePurchase = require('../models/PakkiSalePurchase.model');

const generatePakkiPurchaseNo = async () => {
  try {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    const lastRecord = await PakkiSalePurchase.findOne({
      type: 'buy',
      invoiceNo: new RegExp(`^PKP-${year}-${month}-${day}`)
    }).sort({ invoiceNo: -1 });

    let sequence = 1;
    if (lastRecord) {
      const lastSequence = parseInt(lastRecord.invoiceNo.split('-')[4]);
      sequence = lastSequence + 1;
    }

    return `PKP-${year}-${month}-${day}-${String(sequence).padStart(4, '0')}`;
  } catch (error) {
    console.error('Error generating pakki purchase number:', error);
    return `PKP-${Date.now()}`;
  }
};

const generatePakkiSaleNo = async () => {
  try {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    const lastRecord = await PakkiSalePurchase.findOne({
      type: 'sell',
      invoiceNo: new RegExp(`^PKS-${year}-${month}-${day}`)
    }).sort({ invoiceNo: -1 });

    let sequence = 1;
    if (lastRecord) {
      const lastSequence = parseInt(lastRecord.invoiceNo.split('-')[4]);
      sequence = lastSequence + 1;
    }

    return `PKS-${year}-${month}-${day}-${String(sequence).padStart(4, '0')}`;
  } catch (error) {
    console.error('Error generating pakki sale number:', error);
    return `PKS-${Date.now()}`;
  }
};

module.exports = { generatePakkiPurchaseNo, generatePakkiSaleNo };
