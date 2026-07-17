const mongoose = require('mongoose');

const check = async () => {
  await mongoose.connect('mongodb://127.0.0.1:27017/br-bullian');
  const MetalBadla = require('./src/models/MetalBadla.model.js');
  const Pugga = require('./src/models/Pugga.model.js');
  
  const badlas = await MetalBadla.find({}).populate('paggaIds').populate('partyId').sort({createdAt: -1}).limit(2).lean();
  console.log(JSON.stringify(badlas, null, 2));
  
  mongoose.disconnect();
};
check();
