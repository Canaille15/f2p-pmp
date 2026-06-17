const fs = require('fs');
const path = require('path');

// 1. Créer le fichier de route claude.js
const routeContent = `const router = require('express').Router();

// POST /api/claude — proxy vers Anthropic
router.post('/', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
`;

fs.writeFileSync(path.join(process.cwd(), 'api/api/src/routes/claude.js'), routeContent);
console.log('OK 1 - route claude.js créée');

// 2. Ajouter la route dans server.js
const serverPath = path.join(process.cwd(), 'api/api/server.js');
let server = fs.readFileSync(serverPath, 'utf8');

// Chercher où les routes sont montées
const idx = server.indexOf("require('./src/routes/planning')");
if(idx !== -1) {
  const lineEnd = server.indexOf('\n', idx) + 1;
  server = server.slice(0, lineEnd) + "app.use('/api/claude', require('./src/routes/claude'));\n" + server.slice(lineEnd);
  fs.writeFileSync(serverPath, server);
  console.log('OK 2 - route montée dans server.js');
} else {
  console.log('ERREUR 2 - planning route non trouvée dans server.js');
}
