const mongoose = require('mongoose');
const { getPendingInvoices } = require('./controllers/paymentAllocation.controller');

mongoose.connect('mongodb://127.0.0.1:27017/br-bullian')
  .then(async () => {
    const req = {
      params: {
        partyId: '6a0b4b4485d384e22b982d0b' // Sushil Ji
      }
    };
    
    const res = {
      status: function(code) {
        this.statusCode = code;
        return this;
      },
      json: function(data) {
        console.log('API Response code:', this.statusCode);
        console.log('API Response data:', JSON.stringify(data, null, 2));
      }
    };
    
    await getPendingInvoices(req, res);
    process.exit(0);
  });
