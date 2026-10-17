// A local OpenID provider for the sign-in e2e: auto-approves and signs in "Ploy SSO". Never used in production.
import { OAuth2Server } from 'oauth2-mock-server';

const port = Number(process.argv[2] ?? 5398);
const server = new OAuth2Server();
await server.issuer.keys.generate('RS256');
// The library would announce itself as "localhost"; the server under test is pointed at 127.0.0.1 and checks the names match.
server.issuer.url = `http://127.0.0.1:${port}`;
server.service.on('beforeTokenSigning', (token) => {
  Object.assign(token.payload, { sub: 'sso-ploy', email: 'ploy.sso@company.test', email_verified: true, name: 'Ploy SSO' });
});
await server.start(port, '127.0.0.1');
console.log(`mock IdP at ${server.issuer.url}`);
