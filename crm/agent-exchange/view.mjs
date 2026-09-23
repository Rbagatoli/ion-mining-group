import config from './config.mjs';
import { mountCrmExchangeHost } from './crm-host.mjs';
const template = `
    <p class="boundary">Uses the current Proton account. Outreach remains paused.</p>
    <div class="session"><span><span class="label">Connection</span><strong data-ui="connection">Not configured</strong></span><span><span class="label">Account</span><span data-ui="account">None</span></span><span><span class="label">Endpoint</span><span data-ui="endpoint">Disabled</span></span></div>
    <p class="status" data-ui="notice" role="status" aria-live="polite">Checking the configured connection…</p>
    <div class="grid">
      <div class="stack">
        <section class="card" aria-labelledby="request-heading">
          <h2 id="request-heading">Prepare a lead save</h2>
          <p class="small muted">Read the current register first. Use its exact revision and the complete lead payload. Preparing stores the request locally; it does not save a lead.</p>
          <label class="editor-label" for="lead-request">Request JSON · <code>lead.save</code> only</label>
          <textarea id="lead-request" data-ui="input" spellcheck="false" autocomplete="off" disabled placeholder='{"kind":"action","type":"lead.save","expectedRevision":0,"payload":{}}'></textarea>
          <div class="actions"><button type="button" data-action="read" disabled>Read register</button><button type="button" data-action="prepare" disabled>Prepare request</button></div>
          <p class="support-note">The example is a format hint, not a real revision or lead. Do not paste tokens or credentials.</p>
        </section>
        <section class="card" aria-labelledby="selected-heading">
          <h2 id="selected-heading">Selected operation</h2>
          <p class="small muted" data-ui="selected-label">Choose or prepare an operation.</p>
          <h3>Exact saved request</h3><pre data-ui="request">No operation selected.</pre>
          <div class="actions"><button class="primary" type="button" data-action="submit" disabled>Submit lead save once</button><button type="button" data-action="recover" disabled>Look up original receipt</button><button type="button" data-action="abandon" disabled>Close unsent preparation</button></div>
          <p class="support-note">After an uncertain result, look up the original receipt. Only a never-submitted preparation may be closed locally; its history stays. There is no resend, retry, delete or clear action.</p>
          <h3>Receipt / server response</h3><p class="small muted" data-ui="receipt-label">No server receipt observed.</p><pre data-ui="receipt">No response.</pre>
        </section>
        <section class="card" aria-labelledby="register-heading"><h2 id="register-heading">Server register</h2><p class="small muted">The latest explicit read for the current account.</p><pre data-ui="register">Not read.</pre></section>
      </div>
      <aside class="card" aria-labelledby="journal-heading"><h2 id="journal-heading">Operation journal</h2><p class="small muted">Saved on this browser, scoped to the current account and endpoint. A stored receipt is historical evidence until looked up again.</p><ul class="records" data-ui="records"><li class="empty">No account configured.</li></ul><div class="actions"><button type="button" data-action="list" disabled>Refresh local journal</button></div><p class="support-note">The journal stores requests and receipts, never sign-in tokens. A changed account clears this view; its earlier records remain available only to that original account.</p></aside>
    </div>
    `;

// Receives the original private D; it never creates a second CRM store or signs in.
export function mountCrmAgentView({root,data,auth}) {
  if (!root?.querySelector) throw new TypeError('CRM exchange container required.');
  root.classList.add('agent-exchange');
  if (config.enabled !== true) {
    root.innerHTML='<section class="card"><h2>Connection not configured</h2><p>This CRM connection is prepared but has not been activated. The Grok team’s existing research schedule is unchanged.</p><p class="muted">Outreach remains paused.</p></section>';
    return Object.freeze({disconnect(){root.replaceChildren();}});
  }
  root.innerHTML=template;
  let host;
  try { host=mountCrmExchangeHost({root,data,auth:auth(),config}); }
  catch(error) { root.querySelector('[data-ui="notice"]').textContent=error?.message||'The approved connection is unavailable.'; }
  return Object.freeze({disconnect(){host?.disconnect();root.replaceChildren();}});
}
