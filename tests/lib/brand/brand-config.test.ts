import { describe, expect, it } from 'vitest';
import { DEFAULT_BRAND } from '@/lib/brand/brand-config';

describe('DEFAULT_BRAND (single-brand build)', () => {
  it('uses the original product identity for full chrome', () => {
    expect(DEFAULT_BRAND.productName).toBe('芯火课堂');
    expect(DEFAULT_BRAND.shortName).toBe('芯火课堂');
    expect(DEFAULT_BRAND.markSrc).toBe('/openmaic-mark.png');
    expect(DEFAULT_BRAND.themeColor).toBe('#722ed1');
  });

  it('carries the hero headline and its one-line description', () => {
    expect(DEFAULT_BRAND.heroTitle).toBe('芯火课堂');
    expect(DEFAULT_BRAND.heroSubtitle).toBe('AI 驱动的多智能体互动学习平台');
  });

  it('marks its horizontal logo as already containing the wordmark', () => {
    expect(DEFAULT_BRAND.logoHasWordmark).toBe(true);
    expect(DEFAULT_BRAND.logoSrc).toBe('/logo-horizontal.png');
  });
});
