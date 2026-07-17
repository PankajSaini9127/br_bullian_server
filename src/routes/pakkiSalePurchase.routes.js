const express = require('express');
const router = express.Router();
const { createPakkiSalePurchase, getAllPakkiSalePurchase, getPakkiSalePurchaseById, updatePakkiSalePurchase, deletePakkiSalePurchase, getChorsaPakki, getBankPakki, getPakkiStock } = require('../controllers/pakkiSalePurchase.controller');
const authMiddleware = require('../middleware/auth.middleware');

router.use(authMiddleware);

router.post('/', createPakkiSalePurchase);
router.get('/', getAllPakkiSalePurchase);
router.get('/stock', getPakkiStock);
router.get('/chorsa', getChorsaPakki);
router.get('/bank', getBankPakki);
router.get('/:id', getPakkiSalePurchaseById);
router.put('/:id', updatePakkiSalePurchase);
router.delete('/:id', deletePakkiSalePurchase);

module.exports = router;
