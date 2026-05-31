const express = require('express');
const router = express.Router();
const { getAllUsers, getUserById, updateUserRole, deleteUser } = require('../controllers/user.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { rbacMiddleware } = require('../middleware/rbac.middleware');

// All routes require authentication
router.use(authMiddleware);

// Admin only routes
router.get('/', rbacMiddleware(['admin']), getAllUsers);
router.get('/:id', rbacMiddleware(['admin', 'manager']), getUserById);
router.put('/:id/role', rbacMiddleware(['admin']), updateUserRole);
router.delete('/:id', rbacMiddleware(['admin']), deleteUser);

module.exports = router;
