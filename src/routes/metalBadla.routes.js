const express = require('express');
const router = express.Router();
const {
  createMetalBadla,
  getAllMetalBadla,
  getMetalBadlaById,
  updateMetalBadla,
  deleteMetalBadla
} = require('../controllers/metalBadla.controller');
const authMiddleware = require('../middleware/auth.middleware');

router.use(authMiddleware);

router.post('/', createMetalBadla);
router.get('/', getAllMetalBadla);
router.get('/:id', getMetalBadlaById);
router.put('/:id', updateMetalBadla);
router.delete('/:id', deleteMetalBadla);

module.exports = router;
