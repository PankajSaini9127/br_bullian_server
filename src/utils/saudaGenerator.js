const Sauda = require('../models/Sauda.model');

const generateSaudaNo = async () => {
  try {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    
    const lastSauda = await Sauda.findOne({
      saudaNo: new RegExp(`^SAUDA-${year}-${month}-${day}`)
    }).sort({ saudaNo: -1 });

    let sequence = 1;
    if (lastSauda) {
      const lastSequence = parseInt(lastSauda.saudaNo.split('-')[4]);
      sequence = lastSequence + 1;
    }

    const saudaNo = `SAUDA-${year}-${month}-${day}-${String(sequence).padStart(4, '0')}`;
    return saudaNo;
  } catch (error) {
    console.error('Error generating sauda number:', error);
    return `SAUDA-${Date.now()}`;
  }
};

module.exports = { generateSaudaNo };
