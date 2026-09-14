/**
 * WhatsApp Cloud API Service
 */

const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v20.0';
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_NAME;
const WHATSAPP_TEMPLATE_LANG = process.env.WHATSAPP_TEMPLATE_LANG || 'en';

/**
 * Sends a WhatsApp message using the WhatsApp Cloud API.
 * @param {string} to - Recipient phone number
 * @param {object} payload - The message payload
 */
async function sendWhatsAppRequest(to, payload) {
  if (!WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_ACCESS_TOKEN) {
    console.warn('[WhatsApp Service] WhatsApp configuration is missing (WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN). Message not sent.');
    return null;
  }

  // Clean phone number: remove non-digits
  let formattedPhone = to.replace(/\D/g, '');
  
  // Format for Indian numbers: if 10 digits, prepend country code '91'
  if (formattedPhone.length === 10) {
    formattedPhone = '91' + formattedPhone;
  }

  const url = `${WHATSAPP_API_URL}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const headers = {
    'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
    'Content-Type': 'application/json'
  };

  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: formattedPhone,
    ...payload
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('[WhatsApp Service] Error response from Meta API:', JSON.stringify(data));
      throw new Error(data.error?.message || 'Failed to send WhatsApp message');
    }

    console.log(`[WhatsApp Service] Message sent successfully to ${formattedPhone}. Message ID:`, data.messages?.[0]?.id);
    return data;
  } catch (error) {
    console.error('[WhatsApp Service] Error sending WhatsApp message:', error);
    throw error;
  }
}

/**
 * Sends a notification when a new Sauda is created.
 * @param {object} party - The party object
 * @param {object} sauda - The sauda object
 */
async function sendSaudaCreatedMessage(party, sauda) {
  const partyName = party.partyName;
  const quantityKg = (sauda.quantity / 1000) + ' Kg';
  const rateFormatted = sauda.rate ? Number(sauda.rate).toLocaleString('en-IN') : '0';
  const saudaType = sauda.saudaType === 'sales' ? 'Sale (बिक्री)' : 'Purchase (खरीद)';
  const dateStr = sauda.saudaDate ? new Date(sauda.saudaDate).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN');
  
  let saudaCategoryStr = sauda.saudaCategory || 'kachi';
  if (saudaCategoryStr === 'kachi') {
    saudaCategoryStr = 'Kachi (कच्ची)';
  } else if (saudaCategoryStr === 'chorsa-999') {
    saudaCategoryStr = 'Chorsa 999';
  } else if (saudaCategoryStr === 'bank-9999') {
    saudaCategoryStr = 'Bank 9999';
  }

  if (WHATSAPP_TEMPLATE_NAME) {
    // Template-based message structure
    const payload = {
      type: 'template',
      template: {
        name: WHATSAPP_TEMPLATE_NAME,
        language: {
          code: WHATSAPP_TEMPLATE_LANG
        }
      }
    };

    // If template is 'hello_world', it has 0 variables, so we don't send any parameters
    if (WHATSAPP_TEMPLATE_NAME !== 'hello_world') {
      payload.template.components = [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: partyName },
            { type: 'text', text: saudaType },
            { type: 'text', text: quantityKg },
            { type: 'text', text: rateFormatted },
            { type: 'text', text: dateStr },
            { type: 'text', text: saudaCategoryStr }
          ]
        }
      ];
    }

    return sendWhatsAppRequest(party.contactNo, payload);
  } else {
    // Fallback text message if no template name is specified
    const textMessage = `Dear ${partyName},\n\nYour Sauda has been created successfully.\n\n*Type:* ${saudaType}\n*Category:* ${saudaCategoryStr}\n*Quantity:* ${quantityKg}\n*Rate:* ₹${rateFormatted}\n*Date:* ${dateStr}\n\nThank you for business with us!`;
    const payload = {
      type: 'text',
      text: {
        preview_url: false,
        body: textMessage
      }
    };
    return sendWhatsAppRequest(party.contactNo, payload);
  }
}

module.exports = {
  sendWhatsAppRequest,
  sendSaudaCreatedMessage
};
