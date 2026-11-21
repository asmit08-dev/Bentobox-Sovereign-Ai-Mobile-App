import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pdfScript } from '../../src/lib/pdf/pdfScript';

test('PDF.js runs with eval turned off (CVE-2024-4367)', () => {
  assert.match(pdfScript, /isEvalSupported:\s*false/);
});
