const express = require('express');
const router = express.Router();
const { getReportSummary, getDailyStockReport } = require('../controllers/report.controller');
const authMiddleware = require('../middleware/auth.middleware');

router.use(authMiddleware);
router.get('/', (req, res) => {
  res.json({ success: true, message: 'Reports API is active' });
});
router.get('/summary', getReportSummary);
router.get('/daily-stock', getDailyStockReport);


module.exports = router;
