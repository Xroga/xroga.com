// Node-only server import. Share the actual backend URL/DNS/redirect boundary,
// not a browser fetch or a second copy of its security rules.
export { boundedPublicGet, publicHttpsUrl } from '../../../../backend/src/security/boundedPublicGet';
