const router = require('express').Router();
const { buscarAssinatura, listarPagamentos } = require('../controllers/otherControllers');
const { authenticate, authorize } = require('../middlewares/auth');
const { sanitizeInput } = require('../middlewares/validate');

router.use(sanitizeInput, authenticate);
router.get('/',         authorize('dono','gerente'), buscarAssinatura);
router.get('/pagamentos', authorize('dono'),         listarPagamentos);
module.exports = router;
