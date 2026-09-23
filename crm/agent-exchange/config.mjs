// Deployment pins for the verified Proton account and lead-only gateway.
// No credentials belong in this public configuration. Reuse the existing CRM login.
export default Object.freeze({
  enabled: true,
  endpoint: 'https://proton-agent-interface.renzo-539.workers.dev',
  approvedOrigin: 'https://proton-agent-interface.renzo-539.workers.dev',
  ownerUid: '15nXwDeq9pVS6iRkT7G4Jzhz2y32',
  policyId: 'PROTON-CRM-LEAD-ONLY-20260923'
});
