const express = require('express');
const router = express.Router();
const {
  createPhysicalStockVerification,
  getAllPhysicalStockVerifications,
  getPhysicalStockVerificationById,
  updatePhysicalStockVerification,
  deletePhysicalStockVerification
} = require('../controllers/physicalStockVerification.controller');
const authMiddleware = require('../middleware/auth.middleware');

router.use(authMiddleware);

router.post('/', createPhysicalStockVerification);
router.get('/', getAllPhysicalStockVerifications);
router.get('/:id', getPhysicalStockVerificationById);
router.put('/:id', updatePhysicalStockVerification);
router.delete('/:id', deletePhysicalStockVerification);

module.exports = router;
