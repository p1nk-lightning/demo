import { describe, expect, it } from 'vitest';
import appPackage from '../../package.json';

describe('version consistency (AC-010/AC-014)', () => {
  it('root package version is the release version', () => {
    expect(appPackage.version).toBe('5.0.0');
  });
});
