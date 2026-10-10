// Per-product Jira configuration. Everything that differs between the Core
// (UP) and Marketplace (MP) Jira projects lives here so no other module needs
// to hardcode a project key or fix-version id.

export const DEFAULT_PRODUCT = 'core';

export const PRODUCTS = {
  core: {
    id: 'core',
    label: 'Core',
    projectKey: 'UP',
    // Ids sourced from the UP project's "recommend/fields" response.
    fixVersionOptions: [
      { id: '12023', label: 'To be confirmed' },
      { id: '10244', label: 'N/A' },
    ],
  },
  marketplace: {
    id: 'marketplace',
    label: 'Marketplace',
    projectKey: 'MP',
    // Catch-all ticket for meetings / onboarding / support; grouped as "Others" in the Marketplace report.
    othersTicketKey: 'MP-9665',
    // MP's "To be confirmed" version rotates monthly ("To be confirmed - Oct 2026").
    // Update the first entry's id/label when a new month starts.
    fixVersionOptions: [
      { id: '29407', label: 'To be confirmed - Oct 2026' },
      { id: '12125', label: 'N/A' },
    ],
  },
};

/** Resolve a stored product id to its config. Missing/unknown → Core. */
export function getProduct(productId) {
  return PRODUCTS[productId] || PRODUCTS[DEFAULT_PRODUCT];
}

/** Find the product owning a Jira project key (e.g. "MP"). Unknown → Core. */
export function getProductByProjectKey(projectKey) {
  const key = String(projectKey || '').toUpperCase();
  return Object.values(PRODUCTS).find((p) => p.projectKey === key) || PRODUCTS[DEFAULT_PRODUCT];
}

/**
 * Resolve a user-typed ticket reference into a Jira issue key.
 *  - Bare digits ("9665") → "<projectKey>-9665" using the product's project key
 *  - Full key ("MP-9665") → uppercased, used as-is (explicit key always wins)
 *  - Anything else (incl. empty) → ""
 */
export function resolveTicketKey(raw, productId) {
  const v = String(raw || '').trim();
  if (!v) return '';
  if (/^\d+$/.test(v)) return `${getProduct(productId).projectKey}-${v}`;
  if (/^[A-Za-z][A-Za-z0-9]*-\d+$/.test(v)) return v.toUpperCase();
  return '';
}
