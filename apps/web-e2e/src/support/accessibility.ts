import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * axe rules for WCAG 2.0, 2.1 and 2.2, levels A and AA. axe-core has no
 * `wcag22a` tag (no automatable 2.2 Level A rule exists); `wcag22aa` adds
 * `target-size`. Best-practice rules are left out on purpose: this checks
 * the WCAG target only. Automated rules catch only part of WCAG; passing
 * them is not conformance.
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

type AxeResults = Awaited<ReturnType<AxeBuilder['analyze']>>;
type Violation = AxeResults['violations'][number];

const describeViolation = (violation: Violation): string =>
  [
    `${violation.id} (${violation.impact}): ${violation.help}`,
    `  ${violation.helpUrl}`,
    ...violation.nodes.map(
      (node) => `  - ${node.target.join(' ')}\n    ${node.failureSummary}`,
    ),
  ].join('\n');

/**
 * Scans the page as it is now and fails with one readable entry per
 * violated rule. Call it after asserting the state to check is on screen:
 * axe looks only at what is rendered at that moment.
 */
export const expectNoAccessibilityViolations = async (
  page: Page,
  state: string,
): Promise<void> => {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

  if (results.violations.length > 0) {
    await test.info().attach(`axe violations: ${state}`, {
      body: JSON.stringify(results.violations, null, 2),
      contentType: 'application/json',
    });
  }

  expect(
    results.violations.map(describeViolation),
    `accessibility violations: ${state}`,
  ).toEqual([]);
};
