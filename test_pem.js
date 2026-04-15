const crypto = require('crypto');
try {
  crypto.createPrivateKey("-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n");
  console.log("Valid");
} catch(e) {
  console.error(e);
}
