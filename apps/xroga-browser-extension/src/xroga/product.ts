// An autorun build is the test harness, not the product, unless it is asked to be both (WXT_AUTORUN_PRODUCT=1): that build runs the product
// code against the real backend, for acceptance runs with the real model. A release build sets neither.
export const XROGA_PRODUCT =
  import.meta.env.MODE !== 'test' && (!import.meta.env.WXT_AUTORUN_URL || import.meta.env.WXT_AUTORUN_PRODUCT === '1');
