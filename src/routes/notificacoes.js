const router = require('express').Router();
const { listarNotificacoes, marcarLida, marcarTodasLidas } = require('../controllers/otherControllers');
const { authenticate } = require('../middlewares/auth');
const { sanitizeInput } = require('../middlewares/validate');

router.use(sanitizeInput, authenticate);
router.get('/',         listarNotificacoes);
router.patch('/:id',    marcarLida);
router.patch('/',       marcarTodasLidas);
module.exports = router;
