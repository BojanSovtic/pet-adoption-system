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

/** Name of the per-scan attachment read by accessibility-reporter.ts. */
export const AXE_SCAN_ATTACHMENT = 'axe-scan';

type AxeResults = Awaited<ReturnType<AxeBuilder['analyze']>>;
type AxeRule = AxeResults['violations'][number];

export type ScanNode = {
  target: string[];
  html: string;
  /** axe's "Fix any/all of the following" text. */
  failureSummary?: string;
  /** For incomplete results: what axe could not decide. */
  reasons: string[];
  /** Whether the element is outlined in the annotated screenshot. */
  highlighted: boolean;
  /** Why it isn't, when it isn't. */
  notHighlightedReason?: string;
};

export type ScanFinding = {
  id: string;
  impact: string | null;
  help: string;
  description: string;
  helpUrl: string;
  tags: string[];
  nodes: ScanNode[];
  /** Attachment name of the annotated screenshot, if one was taken. */
  screenshot?: string;
};

export type ScanRecord = {
  state: string;
  /** Path and query only, so the report holds no host names. */
  route: string;
  violations: ScanFinding[];
  incomplete: ScanFinding[];
  passedRules: number;
  /** Attachment name of the unannotated screenshot, if one was taken. */
  originalScreenshot?: string;
  screenshotError?: string;
};

const describeViolation = (violation: AxeRule): string =>
  [
    `${violation.id} (${violation.impact}): ${violation.help}`,
    `  ${violation.helpUrl}`,
    ...violation.nodes.map(
      (node) => `  - ${node.target.join(' ')}\n    ${node.failureSummary}`,
    ),
  ].join('\n');

// axe targets are CSS selectors; a longer array means the element is inside
// an iframe or shadow root, which a page-level selector can't reach.
const singleSelector = (target: unknown[]): string | null =>
  target.length === 1 && typeof target[0] === 'string' ? target[0] : null;

/** Null when the element can be outlined, otherwise the reason it can't. */
const whyNotOutlinable = async (
  page: Page,
  selector: string | null,
): Promise<string | null> => {
  if (!selector) {
    return 'inside an iframe or shadow root';
  }

  const box = await page.locator(selector).first().boundingBox();

  if (!box || box.width === 0 || box.height === 0) {
    return 'no visible box on screen';
  }

  // An outline around the whole page falls outside the screenshot or under
  // a modal overlay, so the image would show nothing.
  const viewport = page.viewportSize();
  if (
    viewport &&
    box.width >= viewport.width &&
    box.height >= viewport.height
  ) {
    return 'the element fills the whole page';
  }

  return null;
};

const toFinding = async (page: Page, rule: AxeRule): Promise<ScanFinding> => ({
  id: rule.id,
  impact: rule.impact ?? null,
  help: rule.help,
  description: rule.description,
  helpUrl: rule.helpUrl,
  tags: rule.tags,
  nodes: await Promise.all(
    rule.nodes.map(async (node) => {
      const reason = await whyNotOutlinable(
        page,
        singleSelector(node.target as unknown[]),
      );

      return {
        target: node.target.map(String),
        html: node.html,
        failureSummary: node.failureSummary,
        reasons: [...node.any, ...node.all, ...node.none]
          .map((check) => check.message)
          .filter(Boolean),
        highlighted: reason === null,
        ...(reason && { notHighlightedReason: reason }),
      };
    }),
  ),
});

// Drawn by the browser on the real elements while Playwright takes the
// screenshot, then removed, so there are no coordinates to go stale. Taken
// after the scan, so it can't change the result.
const outlineCss = (selectors: string[]): string =>
  `${selectors.join(',\n')} {
  outline: 4px solid #e00000 !important;
  outline-offset: 2px !important;
  box-shadow: 0 0 0 8px rgba(255, 210, 0, 0.6) !important;
}`;

const screenshot = (page: Page, style?: string) =>
  page.screenshot({ fullPage: true, animations: 'disabled', style });

/**
 * Screenshots for the report: the page as scanned, and per rule the same
 * page with that rule's elements outlined. Failures here are recorded in
 * the report and never hide the scan result.
 */
const attachScreenshots = async (
  page: Page,
  record: ScanRecord,
  scanNumber: number,
): Promise<void> => {
  const groups = [
    ['violation', record.violations],
    ['review', record.incomplete],
  ] as const;

  if (record.violations.length + record.incomplete.length === 0) {
    return;
  }

  const attach = async (name: string, body: Buffer) => {
    const fullName = `axe screenshot ${scanNumber} ${name}`;
    await test.info().attach(fullName, { body, contentType: 'image/png' });
    return fullName;
  };

  try {
    record.originalScreenshot = await attach('page', await screenshot(page));

    for (const [kind, findings] of groups) {
      for (const [index, finding] of findings.entries()) {
        const selectors = finding.nodes
          .filter((node) => node.highlighted)
          .map((node) => singleSelector(node.target))
          .filter((selector): selector is string => selector !== null);

        if (selectors.length > 0) {
          finding.screenshot = await attach(
            `${kind} ${index + 1} ${finding.id}`,
            await screenshot(page, outlineCss(selectors)),
          );
        }
      }
    }
  } catch (error) {
    record.screenshotError = (error as Error).message;
  }
};

/**
 * Scans the page as it is now and fails with one readable entry per
 * violated rule. Call it after asserting the state to check is on screen:
 * axe looks only at what is rendered at that moment. Every scan is also
 * attached for the Markdown report (accessibility-reporter.ts).
 */
export const expectNoAccessibilityViolations = async (
  page: Page,
  state: string,
): Promise<void> => {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

  const url = new URL(page.url());
  const record: ScanRecord = {
    state,
    route: `${url.pathname}${url.search}`,
    violations: await Promise.all(
      results.violations.map((rule) => toFinding(page, rule)),
    ),
    incomplete: await Promise.all(
      results.incomplete.map((rule) => toFinding(page, rule)),
    ),
    passedRules: results.passes.length,
  };

  const scanNumber =
    test.info().attachments.filter((a) => a.name === AXE_SCAN_ATTACHMENT)
      .length + 1;
  await attachScreenshots(page, record, scanNumber);
  await test.info().attach(AXE_SCAN_ATTACHMENT, {
    body: JSON.stringify(record, null, 2),
    contentType: 'application/json',
  });

  expect(
    results.violations.map(describeViolation),
    `accessibility violations: ${state}`,
  ).toEqual([]);
};
