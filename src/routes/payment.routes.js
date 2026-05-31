const express = require('express');
const router = express.Router();
const {
  createPayment,
  getAllPayments,
  getPaymentById,
  updatePayment,
  deletePayment,
  getCashBook
} = require('../controllers/payment.controller');
const authMiddleware = require('../middleware/auth.middleware');

// All payment routes require authentication
router.use(authMiddleware);

router.post('/', createPayment);
router.get('/', getAllPayments);
router.get('/cash-book', getCashBook);
router.get('/:id', getPaymentById);
router.put('/:id', updatePayment);
router.delete('/:id', deletePayment);

module.exports = router;
