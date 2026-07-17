const express = require('express');
const router = express.Router();
const { getReportSummary } = require('../controllers/report.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Apply auth middleware to all report routes
router.use(authMiddleware);

router.get('/summary', getReportSummary);

module.exports = router;
