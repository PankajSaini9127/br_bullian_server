const express = require('express');
const router = express.Router();
const { getProfile, updateProfile } = require('../controllers/profile.controller');
const authMiddleware = require('../middleware/auth.middleware');

// All profile routes require authentication
router.use(authMiddleware);

router.get('/', getProfile);
router.put('/', updateProfile);

module.exports = router;
