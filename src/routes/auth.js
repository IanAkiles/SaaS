const router = require('express').Router();
const ctrl   = require('../controllers/authController');
const { authenticate } = require('../middlewares/auth');
const { validate, sanitizeInput } = require('../middlewares/validate');
const S = require('../utils/schemas');

router.use(sanitizeInput);

// POST /api/auth/register
router.post('/register',        validate(S.register),        ctrl.register);

// POST /api/auth/login
router.post('/login',           validate(S.login),           ctrl.login);

// POST /api/auth/refresh
router.post('/refresh',         validate(S.refresh),         ctrl.refresh);

// POST /api/auth/forgot-password
router.post('/forgot-password', validate(S.forgotPassword),  ctrl.forgotPassword);

// POST /api/auth/reset-password
router.post('/reset-password',  validate(S.resetPassword),   ctrl.resetPassword);

// GET  /api/auth/me  (precisa de token)
router.get('/me', authenticate, ctrl.me);

// POST /api/auth/logout
router.post('/logout', authenticate, ctrl.logout);

module.exports = router;
