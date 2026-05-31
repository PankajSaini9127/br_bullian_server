const express = require('express');
const router = express.Router();
const { createSauda, getAllSaudas, getSaudaById, updateSauda, deleteSauda } = require('../controllers/sauda.controller');
const authMiddleware = require('../middleware/auth.middleware');

// All sauda routes require authentication
router.use(authMiddleware);

router.post('/', createSauda);
router.get('/', getAllSaudas);
router.get('/:id', getSaudaById);
router.put('/:id', updateSauda);
router.delete('/:id', deleteSauda);

module.exports = router;
