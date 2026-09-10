/**
 * Brand configuration.
 *
 * The reference (live deployment) resolves the brand per vendor from the
 * desktop shell's User-Agent token. This workspace has no vendor shell: the
 * product ships with its own single brand, so the config is static and the
 * desktop flag is always off. The shape is kept so surfaces that read the
 * brand (home hero, workspace rail, site header) keep one source of truth.
 */

export interface BrandConfig {
  /** Full product name (page titles, logo alt text). */
  productName: string;
  /** Short name for space-constrained spots. */
  shortName: string;
  /** Hero headline shown on the home page and the workspace landing. */
  heroTitle: string;
  /** One-line description under `heroTitle`. */
  heroSubtitle: string;
  /** Horizontal logo asset under `public/`. */
  logoSrc: string;
  /** Whether `logoSrc` already carries the product wordmark. */
  logoHasWordmark: boolean;
  /** Square brand mark under `public/` (favicon, workspace header). */
  markSrc: string;
  /** Browser theme color (`<meta name="theme-color">` / PWA). */
  themeColor: string;
}

/** The default brand: the product itself, with no vendor overrides. */
export const DEFAULT_BRAND: BrandConfig = {
  productName: '芯火课堂',
  shortName: '芯火课堂',
  heroTitle: '芯火课堂',
  heroSubtitle: 'AI 驱动的多智能体互动学习平台',
  logoSrc: '/logo-horizontal.png',
  logoHasWordmark: true,
  markSrc: '/openmaic-mark.png',
  themeColor: '#722ed1',
};
