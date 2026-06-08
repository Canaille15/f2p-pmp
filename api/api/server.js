require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const { apiLimiter } = require('./src/middleware/rateLimiter');

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());
app.use('/api', apiLimiter);

app.use('/api/auth',          require('./src/routes/auth'));
app.use('/api/agents',        require('./src/routes/agents'));
app.use('/api/planning',      require('./src/routes/planning'));
app.use('/api/profil',        require('./src/routes/profil'));
app.use('/api/conges',        require('./src/routes/conges'));
app.use('/api/fetes',         require('./src/routes/fetes'));
app.use('/api/pauses',        require('./src/routes/pauses'));
app.use('/api/notifications', require('./src/routes/notifications'));
app.use('/api/echanges',      require('./src/routes/echanges'));

app.get('/health', (req, res) => res.json({ status: 'ok', routes: 9, ts: new Date() }));
app.use((req, res) => res.status(404).json({ error: 'Route introuvable' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Erreur interne' }); });

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API F2P.PMP sur http://localhost:${PORT}`));
