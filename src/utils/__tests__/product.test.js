import { describe, it, expect } from 'vitest';
import { getProduct, getProductByProjectKey, resolveTicketKey } from '../product.js';

describe('getProduct', () => {
  it('returns Marketplace for "marketplace"', () => {
    expect(getProduct('marketplace').projectKey).toBe('MP');
  });
  it('falls back to Core when missing or unknown', () => {
    expect(getProduct(undefined).projectKey).toBe('UP');
    expect(getProduct('nope').projectKey).toBe('UP');
  });
});

describe('getProductByProjectKey', () => {
  it('maps MP → Marketplace and UP → Core, unknown → Core', () => {
    expect(getProductByProjectKey('MP').id).toBe('marketplace');
    expect(getProductByProjectKey('up').id).toBe('core');
    expect(getProductByProjectKey('XYZ').id).toBe('core');
  });
});

describe('resolveTicketKey', () => {
  it('expands bare digits using the selected product', () => {
    expect(resolveTicketKey('9665', 'marketplace')).toBe('MP-9665');
    expect(resolveTicketKey('9665', 'core')).toBe('UP-9665');
  });
  it('treats a missing product as Core', () => {
    expect(resolveTicketKey('9665')).toBe('UP-9665');
  });
  it('keeps an explicit key regardless of product', () => {
    expect(resolveTicketKey('up-1', 'marketplace')).toBe('UP-1');
  });
  it('returns empty for blank/invalid input', () => {
    expect(resolveTicketKey('  ', 'core')).toBe('');
    expect(resolveTicketKey('abc', 'core')).toBe('');
  });
});
