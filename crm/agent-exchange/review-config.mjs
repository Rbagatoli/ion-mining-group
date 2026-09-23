// Staged only. Deployment code must supply explicit, independently verified pins.
// Never derive these values from query strings, browser storage or agent input.
export const disabledConfig = Object.freeze({
  enabled: false,
  endpoint: '',
  approvedOrigin: '',
  ownerUid: '',
  actorUid: '',
  reviewerUid: '',
  role: '',
  policyId: ''
});
export default disabledConfig;
