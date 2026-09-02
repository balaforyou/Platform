import { describe, expect, it } from 'vitest';
import { initialsFromName } from './Avatar';

describe('initialsFromName', () => {
  it('takes the first letter of the first two words', () => {
    expect(initialsFromName('Bala Murali')).toBe('BM');
    expect(initialsFromName('japan badminton court')).toBe('JB');
  });

  it('handles a single word', () => {
    expect(initialsFromName('Bala')).toBe('B');
  });

  it('collapses extra whitespace', () => {
    expect(initialsFromName('  Bala   Murali  ')).toBe('BM');
  });

  it('falls back to ? for an empty / whitespace name', () => {
    expect(initialsFromName('')).toBe('?');
    expect(initialsFromName('   ')).toBe('?');
  });

  it('uppercases', () => {
    expect(initialsFromName('bala')).toBe('B');
  });
});
