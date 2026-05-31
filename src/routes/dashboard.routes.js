const express = require('express');
const router = express.Router();
const { getDashboard } = require('../controllers/dashboard.controller');
const authMiddleware = require('../middleware/auth.middleware');

router.use(authMiddleware);

router.get('/', getDashboard);

module.exports = router;
