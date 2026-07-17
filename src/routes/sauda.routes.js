const express = require('express');
const router = express.Router();
const { createSauda, getAllSaudas, getSaudaById, updateSauda, deleteSauda, getPartySaudaSummary, getPartyPendingPakkiSaudas, getPartyPendingKachiSaudas } = require('../controllers/sauda.controller');
const authMiddleware = require('../middleware/auth.middleware');

// All sauda routes require authentication
router.use(authMiddleware);

router.post('/', createSauda);
router.get('/', getAllSaudas);
router.get('/party/:partyId/summary', getPartySaudaSummary);
router.get('/party/:partyId/pending-pakki', getPartyPendingPakkiSaudas);
router.get('/party/:partyId/pending-kachi', getPartyPendingKachiSaudas);
router.get('/:id', getSaudaById);
router.put('/:id', updateSauda);
router.delete('/:id', deleteSauda);

module.exports = router;
