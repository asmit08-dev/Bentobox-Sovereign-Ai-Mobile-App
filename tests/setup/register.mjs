// Loaded by `npm test` before the tests: lets Node find .ts files imported without an extension.
import { register } from 'node:module';

register('./resolve-ts.mjs', import.meta.url);
