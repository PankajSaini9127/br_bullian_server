const express = require('express');
const router = express.Router();
const { createParty, getPartyDropdown, getAllParties, getPartyById, updateParty, deleteParty, getPartyLedger } = require('../controllers/party.controller');
const authMiddleware = require('../middleware/auth.middleware');

// All party routes require authentication
router.use(authMiddleware);

router.post('/', createParty);
router.get('/dropdown', getPartyDropdown);
router.get('/', getAllParties);
router.get('/ledger/:partyId', getPartyLedger);
router.get('/:id', getPartyById);
router.put('/:id', updateParty);
router.delete('/:id', deleteParty);

module.exports = router;
