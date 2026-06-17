const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'api', 'api', 'src', 'controllers', 'authController.js');
let c = fs.readFileSync(filePath, 'utf8');

c = c.replace("process.env.JWT_EXPIRES_IN||'8h'", "process.env.JWT_EXPIRES_IN||'30d'");
fs.writeFileSync(filePath, c, 'utf8');
console.log('OK - token 30 jours');
