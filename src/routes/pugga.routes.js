const express = require('express');
const router = express.Router();
const { createPugga, getAllPuggas, getPuggaById, updatePugga, deletePugga, getPuggasForSale, getPuggasByParty } = require('../controllers/pugga.controller');
const authMiddleware = require('../middleware/auth.middleware');

// All pugga routes require authentication
router.use(authMiddleware);

router.post('/', createPugga);
router.get('/', getAllPuggas);
router.get('/for-sale', getPuggasForSale);
router.get('/party/:partyId', getPuggasByParty);
router.get('/:id', getPuggaById);
router.put('/:id', updatePugga);
router.delete('/:id', deletePugga);

module.exports = router;
