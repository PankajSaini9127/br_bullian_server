require('dotenv').config();
const { sendSaudaCreatedMessage } = require('./src/utils/whatsapp.service');

async function test() {
  const contactNo = process.argv[2];
  if (!contactNo) {
    console.error('Please provide a contact number as an argument, e.g., node test_whatsapp.js 91XXXXXXXXXX');
    process.exit(1);
  }

  const dummyParty = {
    partyName: 'Test Party Name',
    contactNo: contactNo
  };

  const dummySauda = {
    saudaNo: 'SAUDA-TEST-001',
    quantity: 100,
    rate: 72000,
    saudaType: 'sales',
    saudaCategory: 'chorsa-999',
    saudaDate: new Date()
  };

  console.log('Sending message to:', contactNo);
  console.log('Using template:', process.env.WHATSAPP_TEMPLATE_NAME);
  console.log('Language:', process.env.WHATSAPP_TEMPLATE_LANG);
  
  try {
    const result = await sendSaudaCreatedMessage(dummyParty, dummySauda);
    console.log('Message send result:', result);
  } catch (error) {
    console.error('Error sending message:', error.message);
  }
}

test();
