const Payment = require('../models/Payment.model');

const generatePaymentNo = async (paymentType) => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;

  const prefix = paymentType === 'incoming' ? 'IN' : 'OUT';

  const lastPayment = await Payment.findOne({
    paymentNo: new RegExp(`^${prefix}${dateStr}`)
  }).sort({ paymentNo: -1 });

  let sequence = 1;
  if (lastPayment) {
    const lastSeq = parseInt(lastPayment.paymentNo.slice(-3));
    sequence = lastSeq + 1;
  }

  const sequenceStr = String(sequence).padStart(3, '0');
  return `${prefix}${dateStr}${sequenceStr}`;
};

module.exports = { generatePaymentNo };
