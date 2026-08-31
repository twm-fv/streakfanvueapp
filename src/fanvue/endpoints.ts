/**
 * Every Fanvue API path the prototype touches, in one place.
 *
 * `confirmed` paths are the ones published in the public API reference
 * (https://api.fanvue.com/docs/api-reference). `unconfirmed` paths are shaped from the
 * integration guide's prose and MUST be checked against the live reference before the
 * pilot: run `npm run verify:api` with a dev-account token and fix anything that 404s.
 */
export const endpoints = {
  /** confirmed: lists the authenticated creator's media, videos included. */
  listMedia: '/media',
  /** confirmed: single media object; `variants` selects signed URLs (main,thumbnail,blurred). */
  media: (uuid: string, variants = 'main') => `/media/${uuid}?variants=${encodeURIComponent(variants)}`,

  /** confirmed: three-step upload used to push finished clips back into the Vault. */
  createUploadSession: '/media/upload-sessions',
  completeUploadSession: (sessionId: string) => `/media/upload-sessions/${sessionId}/complete`,

  /** unconfirmed: Vault folder endpoints exist per the integration notes; paths need checking. */
  listFolders: '/vault/folders',
  folderMedia: (folderId: string) => `/vault/folders/${folderId}/media`,

  /** unconfirmed: payment session initiation, real path comes with app registration. */
  createPurchaseRequest: '/payments/purchase-requests',
} as const;

export const unconfirmedEndpointKeys = ['listFolders', 'folderMedia', 'createPurchaseRequest'] as const;
