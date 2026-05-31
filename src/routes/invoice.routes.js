const express = require('express');
const router = express.Router();
const { createInvoice, getAllInvoices, getInvoiceById, updateInvoice, deleteInvoice, getInvoiceSaudaReport } = require('../controllers/invoice.controller');
const authMiddleware = require('../middleware/auth.middleware');

// All invoice routes require authentication
router.use(authMiddleware);

router.post('/', createInvoice);
router.get('/sauda-report', getInvoiceSaudaReport);
router.get('/', getAllInvoices);
router.get('/:id', getInvoiceById);
router.put('/:id', updateInvoice);
router.delete('/:id', deleteInvoice);

module.exports = router;
