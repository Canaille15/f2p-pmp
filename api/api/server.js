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
// no-store sur tout /api (24/08) : Express pose un ETag faible par defaut sur
// chaque reponse JSON -- sans Cache-Control explicite, certains navigateurs
// (Safari/iOS en tete, heuristique de fraicheur bien plus agressive que
// Chrome desktop) peuvent servir une reponse GET depuis leur cache local
// plutot que de revalider en reseau, y compris juste apres un PUT/POST qui
// vient de modifier cette meme ressource -- aucune relation d'invalidation
// automatique entre les deux URLs distinctes en HTTP standard. Symptome reel
// observe par Olivier (Pause Figee, module TC) : une pause tout juste
// validee "repassait en attente" apres avoir choisi le mois de constatation
// -- vérifié en base que l'ecriture elle-meme etait bien correcte a chaque
// etape, seul l'AFFICHAGE (donc la lecture GET suivante) redevenait faux.
// Toute donnee de cette API est par nature dynamique et privee (jamais
// destinee a etre mise en cache) -- no-store elimine cette classe de bug
// d'un coup, pour tous les modules, pas seulement Pause Figee.
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use('/api', apiLimiter);

app.use('/api/auth',          require('./src/routes/auth'));
app.use('/api/agents',        require('./src/routes/agents'));
app.use('/api/planning',      require('./src/routes/planning'));
app.use('/api/planning',      require('./src/routes/bulletinImport'));
app.use('/api/cps',            require('./src/routes/cps'));
app.use('/api/cps-aleas',      require('./src/routes/aleas'));
app.use('/api/claude', require('./src/routes/claude'));
app.use('/api/profil',        require('./src/routes/profil'));
app.use('/api/conges',        require('./src/routes/conges'));
app.use('/api/fetes',         require('./src/routes/fetes'));
app.use('/api/pauses',        require('./src/routes/pauses'));
app.use('/api/notifications', require('./src/routes/notifications'));
app.use('/api/echanges',      require('./src/routes/echanges'));
app.use('/api/previsionnel-signalements', require('./src/routes/previsionnelSignalements'));
app.use('/api/journee-speciale-notes', require('./src/routes/journeeSpecialeNotes'));
app.use('/api/annuaire',      require('./src/routes/annuaire'));
app.use('/api/annuaire',      require('./src/routes/annuaire'));
app.use('/api/formation',     require('./src/routes/formation'));
app.use('/api/stats-equipe',  require('./src/routes/statsEquipe'));

app.get('/health', (req, res) => res.json({ status: 'ok', routes: 9, ts: new Date() }));
app.use((req, res) => res.status(404).json({ error: 'Route introuvable' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Erreur interne' }); });

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API F2P.PMP sur http://localhost:${PORT}`));
