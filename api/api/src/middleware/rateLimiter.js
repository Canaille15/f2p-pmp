const rateLimit = require('express-rate-limit');
const loginLimiter = rateLimit({ windowMs: 15*60*1000, max: 10, message: { error: 'Trop de tentatives' } });
const apiLimiter   = rateLimit({ windowMs: 60*1000,    max: 200, message: { error: 'Trop de requêtes' } });
module.exports = { loginLimiter, apiLimiter };
