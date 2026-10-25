const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

test('newsletter validates required fields and hands a valid submission to Brevo without claiming success locally', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://example.test/', runScripts: 'outside-only' });
  try {
    const { window } = dom;
    window.document.querySelectorAll('script:not([src])').forEach(script => window.eval(script.textContent));
    const form = window.document.getElementById('newsletter-form');
    const email = form.elements.namedItem('EMAIL');
    const consent = form.elements.namedItem('OPT_IN');
    assert.equal(form.checkValidity(), false);
    email.value = 'invalid';
    consent.checked = true;
    assert.equal(form.checkValidity(), false);
    email.value = 'reader@example.test';
    consent.checked = false;
    assert.equal(form.checkValidity(), false);
    consent.checked = true;
    assert.equal(form.checkValidity(), true);
    assert.equal(form.querySelector('button[type="submit"]').form, form);
    assert.equal(form.method, 'post');
    assert.match(new URL(form.action).hostname, /\.sibforms\.com$/);
    const data = new window.FormData(form);
    assert.equal(data.get('EMAIL'), 'reader@example.test');
    assert.equal(data.get('OPT_IN'), '1');
    assert.equal(data.get('locale'), 'en');
    const before = form.textContent;
    const submission = new window.Event('submit', { bubbles: true, cancelable: true });
    // Dispatch only: no live email is sent and navigation is not simulated.
    assert.equal(form.dispatchEvent(submission), true);
    assert.equal(submission.defaultPrevented, false);
    assert.equal(form.textContent, before);
    assert.equal(email.value, 'reader@example.test');
  } finally {
    dom.window.close();
  }
});
