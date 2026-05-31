const express = require('express');
const router = express.Router();
const { createSalesInvoice, getAllSalesInvoices, getSalesInvoiceById, updateSalesInvoice, deleteSalesInvoice, markAsDukanStock } = require('../controllers/salesInvoice.controller');
const authMiddleware = require('../middleware/auth.middleware');

// All sales invoice routes require authentication
router.use(authMiddleware);

router.post('/', createSalesInvoice);
router.post('/mark-dukan-stock', markAsDukanStock);
router.get('/', getAllSalesInvoices);
router.get('/:id', getSalesInvoiceById);
router.put('/:id', updateSalesInvoice);
router.delete('/:id', deleteSalesInvoice);

module.exports = router;
