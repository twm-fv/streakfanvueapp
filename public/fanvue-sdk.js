/**
 * Stand-in for the Fanvue Embedded App SDK.
 *
 * The real SDK is supplied by Fanvue at app registration and does the signed,
 * session-scoped postMessage handshake with the parent window. This shim keeps the call
 * sites honest (same method names, same message shapes) so swapping it out is a one-line
 * import change. Messages never carry identity or authorization claims: the creator is
 * resolved from the backend session, and payment results arrive by webhook.
 */
const PARENT_ORIGIN_PATTERN = /^https:\/\/([a-z0-9-]+\.)*fanvue\.com$/;

function post(type, payload) {
  if (window.parent === window) {
    console.info('[fanvue-sdk] not framed, dropping message', type, payload);
    return;
  }
  // The real SDK resolves the exact parent origin during the handshake. Until then we
  // target the origin the frame was opened from and let the browser drop mismatches.
  const target = document.referrer ? new URL(document.referrer).origin : '';
  if (!PARENT_ORIGIN_PATTERN.test(target)) {
    console.warn('[fanvue-sdk] parent origin not recognised, refusing to post', target);
    return;
  }
  window.parent.postMessage({ source: 'fanvue-embedded-app', type, payload }, target);
}

export const fanvue = {
  /** Ask the shell to resize the iframe to the app's content height. */
  resize(height) {
    post('resize', { height });
  },
  /** Opens Fanvue's native payment modal for a purchase request created by our backend. */
  createPurchaseRequest(purchase) {
    post('createPurchaseRequest', {
      purchaseRequestId: purchase.id,
      minutes: purchase.minutes,
      priceCents: purchase.priceCents,
    });
  },
  /** Tells the shell an in-app action finished, so it can refresh surrounding UI. */
  actionCompleted(action) {
    post('actionCompleted', { action });
  },
};
