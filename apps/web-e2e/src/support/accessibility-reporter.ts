import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';

import {
  AXE_SCAN_ATTACHMENT,
  type ScanFinding,
  type ScanRecord,
} from './accessibility';

/**
 * Writes test-results/accessibility-report/report.md (and images/) from the
 * scans that `expectNoAccessibilityViolations` attaches, whenever the run
 * includes tests tagged @a11y. Runs next to the normal reporters.
 *
 * test-results/ because Playwright empties it at the start of every run, it
 * is ignored by Git, it is the e2e target's Nx cache output (so a cache hit
 * restores the report) and CI uploads it when a run fails.
 */

const A11Y_TAG = '@a11y';

// The success criteria that the selected axe rules map to (axe tags
// `wcag143` etc.), named as in WCAG 2.2.
const CRITERIA: Record<string, string> = {
  '1.1.1': 'Non-text Content',
  '1.2.1': 'Audio-only and Video-only (Prerecorded)',
  '1.2.2': 'Captions (Prerecorded)',
  '1.3.1': 'Info and Relationships',
  '1.3.4': 'Orientation',
  '1.3.5': 'Identify Input Purpose',
  '1.4.1': 'Use of Color',
  '1.4.2': 'Audio Control',
  '1.4.3': 'Contrast (Minimum)',
  '1.4.4': 'Resize Text',
  '1.4.12': 'Text Spacing',
  '2.1.1': 'Keyboard',
  '2.1.3': 'Keyboard (No Exception)',
  '2.2.1': 'Timing Adjustable',
  '2.2.2': 'Pause, Stop, Hide',
  '2.4.1': 'Bypass Blocks',
  '2.4.2': 'Page Titled',
  '2.4.4': 'Link Purpose (In Context)',
  '2.5.3': 'Label in Name',
  '2.5.8': 'Target Size (Minimum)',
  '3.1.1': 'Language of Page',
  '3.1.2': 'Language of Parts',
  '3.3.2': 'Labels or Instructions',
  '4.1.2': 'Name, Role, Value',
};

const IMPACTS = ['critical', 'serious', 'moderate', 'minor'] as const;

const IMPACT_MEANING: Record<(typeof IMPACTS)[number], string> = {
  critical: 'blocks some users from using the content at all',
  serious: 'makes the content very hard to use for some users',
  moderate: 'makes the content harder to use for some users',
  minor: 'a nuisance that users can usually work around',
};

// Suggestions for the rules this app has produced as "needs review"; other
// rules fall back to axe's own wording.
const MANUAL_CHECKS: Record<string, string> = {
  'color-contrast':
    'Measure the text against the colour actually behind it (browser dev tools or a contrast checker): at least 4.5:1, or 3:1 for large text. If another element covers the text, as with an open menu, check the text that stays visible.',
  'aria-hidden-focus':
    'Press Tab and Shift+Tab through the whole page and check that focus never lands on an element a screen reader cannot see. Radix focus guards only redirect focus and are normally fine.',
};

type ScanEntry = {
  number: number;
  test: string;
  record: ScanRecord;
  images: Map<string, string>;
};

const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

// Keeps axe's prose from being read as HTML (`<html> element must ...`).
const prose = (text: string): string =>
  text.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '\\|');

const code = (text: string): string => `\`${text.replace(/`/g, "'")}\``;

const criteriaOf = (finding: ScanFinding): string => {
  const level = finding.tags.some((tag) => /^wcag2\d?aa$/.test(tag))
    ? 'AA'
    : finding.tags.some((tag) => /^wcag2\d?a$/.test(tag))
      ? 'A'
      : null;
  const criteria = finding.tags
    .filter((tag) => /^wcag\d{3,}$/.test(tag))
    .map((tag) => {
      const digits = tag.slice(4);
      const number = `${digits[0]}.${digits[1]}.${digits.slice(2)}`;
      return `${number} ${CRITERIA[number] ?? ''}`.trim();
    });

  if (criteria.length === 0) {
    return 'no WCAG criterion mapped by axe';
  }

  return `${criteria.join(', ')}${level ? ` (Level ${level} rule set)` : ''}`;
};

const formatDate = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())} ` +
    `(UTC${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)})`
  );
};

const elementCount = (findings: ScanFinding[]): number =>
  findings.reduce((sum, finding) => sum + finding.nodes.length, 0);

const count = (n: number, noun: string): string =>
  `${n} ${noun}${n === 1 ? '' : 's'}`;

// Playwright error messages carry terminal colour codes.
// eslint-disable-next-line no-control-regex
const stripAnsi = (text: string): string => text.replace(/\u001b\[\d+m/g, '');

const truncate = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max)} …` : text;

const renderNodes = (
  finding: ScanFinding,
  kind: 'violation' | 'incomplete',
): string[] =>
  finding.nodes.flatMap((node, index) => {
    const lines = [
      `${index + 1}. ${code(node.target.join(' → '))}${
        node.highlighted
          ? ''
          : ` (not highlighted: ${node.notHighlightedReason ?? 'unknown reason'})`
      }`,
      '',
      '   ```html',
      `   ${truncate(node.html.replace(/\s+/g, ' '), 300)}`,
      '   ```',
      '',
    ];
    if (kind === 'incomplete' && node.reasons.length > 0) {
      return [
        ...lines,
        ...node.reasons.map(
          (reason) => `   axe could not decide: ${prose(reason)}`,
        ),
        '',
      ];
    }

    // "Fix any of the following:" followed by one check per line; a
    // heading line and a nested list keep them apart when rendered.
    const summary = (node.failureSummary ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) =>
        line.endsWith(':') ? `   **${prose(line)}**` : `   - ${prose(line)}`,
      );

    return [...lines, ...summary, ''];
  });

const renderFinding = (
  entry: ScanEntry,
  finding: ScanFinding,
  index: number,
  kind: 'violation' | 'incomplete',
): string[] => {
  const image = finding.screenshot && entry.images.get(finding.screenshot);
  const impact = finding.impact as (typeof IMPACTS)[number] | null;

  return [
    `#### ${index + 1}. ${prose(finding.help)} (${code(finding.id)})`,
    '',
    kind === 'violation'
      ? `- **Impact:** ${impact ?? 'unknown'}${impact ? ` (${IMPACT_MEANING[impact]})` : ''}`
      : `- **Status:** needs manual review (not a confirmed violation)`,
    `- **WCAG:** ${criteriaOf(finding)}`,
    `- **What the rule checks:** ${prose(finding.description)}`,
    kind === 'violation'
      ? `- **How to fix:** see each element below, and [axe's explanation](${finding.helpUrl}).`
      : `- **Manual check:** ${prose(
          MANUAL_CHECKS[finding.id] ??
            `check by hand that this holds: ${finding.help}.`,
        )} [axe's explanation](${finding.helpUrl})`,
    `- **Elements (${finding.nodes.length}):**`,
    '',
    ...renderNodes(finding, kind),
    image
      ? `![${finding.id}, outlined in red](${image})`
      : '_No annotated screenshot: none of these elements can be outlined (reasons above). Use the selectors and HTML to find them._',
    '',
  ];
};

const renderState = (
  entry: ScanEntry,
  kind: 'violation' | 'incomplete',
): string[] => {
  const findings =
    kind === 'violation' ? entry.record.violations : entry.record.incomplete;
  const original =
    entry.record.originalScreenshot &&
    entry.images.get(entry.record.originalScreenshot);

  return [
    `### ${entry.number}. ${prose(entry.record.state)}`,
    '',
    `Route ${code(entry.record.route)} · test "${prose(entry.test)}" · ${count(
      findings.length,
      'rule',
    )}, ${count(elementCount(findings), 'element')}${
      original ? ` · [page without highlights](${original})` : ''
    }`,
    '',
    ...(entry.record.screenshotError
      ? [
          `> Screenshots failed: ${prose(entry.record.screenshotError)}. The selectors below are still accurate.`,
          '',
        ]
      : []),
    ...findings.flatMap((finding, index) =>
      renderFinding(entry, finding, index, kind),
    ),
  ];
};

const STATUS_LABEL: Record<string, string> = {
  passed: 'passed',
  failed: 'FAILED',
  timedOut: 'TIMED OUT',
  skipped: 'skipped',
  interrupted: 'interrupted',
};

class AccessibilityReporter implements Reporter {
  private reportDir = '';
  private a11yTests: TestCase[] = [];
  private readonly results = new Map<TestCase, TestResult>();

  onBegin(config: FullConfig, suite: Suite): void {
    const outputDir = config.projects[0]?.outputDir ?? 'test-results';
    this.reportDir = path.join(outputDir, 'accessibility-report');
    this.a11yTests = suite
      .allTests()
      .filter((test) => test.tags.includes(A11Y_TAG));
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (test.tags.includes(A11Y_TAG)) {
      this.results.set(test, result);
    }
  }

  async onEnd(result: FullResult): Promise<void> {
    if (this.a11yTests.length === 0) {
      return;
    }

    await rm(this.reportDir, { recursive: true, force: true });
    await mkdir(path.join(this.reportDir, 'images'), { recursive: true });

    const entries: ScanEntry[] = [];

    for (const test of this.a11yTests) {
      const testResult = this.results.get(test);

      for (const attachment of testResult?.attachments ?? []) {
        if (attachment.name !== AXE_SCAN_ATTACHMENT || !attachment.body) {
          continue;
        }

        const record = JSON.parse(attachment.body.toString()) as ScanRecord;
        const number = entries.length + 1;
        const images = new Map<string, string>();

        for (const image of testResult?.attachments ?? []) {
          const isOwn =
            image.name === record.originalScreenshot ||
            [...record.violations, ...record.incomplete].some(
              (finding) => finding.screenshot === image.name,
            );

          if (isOwn && image.body) {
            const file = `images/${String(number).padStart(2, '0')}-${slug(record.state)}-${slug(image.name.replace(/^axe screenshot \d+ /, ''))}.png`;
            await writeFile(path.join(this.reportDir, file), image.body);
            images.set(image.name, file);
          }
        }

        entries.push({ number, test: test.title, record, images });
      }
    }

    await writeFile(
      path.join(this.reportDir, 'report.md'),
      this.render(result, entries),
    );
  }

  private render(result: FullResult, entries: ScanEntry[]): string {
    const violations = entries.flatMap((entry) => entry.record.violations);
    const incomplete = entries.flatMap((entry) => entry.record.incomplete);
    const byImpact = IMPACTS.map(
      (impact) =>
        `${impact} ${violations.filter((v) => v.impact === impact).length}`,
    ).join(' · ');
    const withViolations = entries.filter((e) => e.record.violations.length);
    const withIncomplete = entries.filter((e) => e.record.incomplete.length);

    const tests = this.a11yTests.map((test) => {
      const testResult = this.results.get(test);
      const scans = entries.filter((entry) => entry.test === test.title).length;
      const status = testResult ? STATUS_LABEL[testResult.status] : 'not run';
      const error = stripAnsi(testResult?.error?.message ?? '').split('\n')[0];

      return `| ${prose(test.title)} | ${status} | ${scans} |${
        error && testResult?.status !== 'passed' ? ` ${prose(error)}` : ''
      } |`;
    });

    return [
      '# Accessibility report',
      '',
      `Generated ${formatDate(new Date())} by the Playwright run's axe scans (tests tagged ${code(A11Y_TAG)}). Run result: **${result.status}**.`,
      '',
      '## Summary',
      '',
      '| | |',
      '| --- | --- |',
      `| States scanned | ${entries.length} |`,
      `| Violations | **${count(violations.length, 'rule')}, ${count(elementCount(violations), 'element')}** in ${count(withViolations.length, 'state')} |`,
      `| By impact | ${byImpact} |`,
      `| Needs manual review (not violations) | ${count(incomplete.length, 'rule')}, ${count(elementCount(incomplete), 'element')} in ${count(withIncomplete.length, 'state')} |`,
      '',
      '| Test | Result | States scanned | Error |',
      '| --- | --- | --- | --- |',
      ...tests,
      '',
      '**What this covers.** axe ran the automated WCAG 2.0, 2.1 and 2.2 Level A and AA rules on each state listed below, exactly as it was on screen when scanned. A violation is a confirmed failure of one of those rules. "Needs manual review" means axe found something it could not decide; a person has to check it.',
      '',
      '**What it cannot establish.** Automated rules cover only part of WCAG. A clean report does not mean the pages conform to WCAG 2.2 AA or meet any legal requirement. Keyboard use, focus order, screen-reader announcements, zoom and reflow, meaningful alt text and wording, and every page or state not listed here still need manual testing.',
      '',
      '## Violations',
      '',
      ...(violations.length === 0
        ? [`None in the ${entries.length} scanned states.`, '']
        : withViolations.flatMap((entry) => renderState(entry, 'violation'))),
      '## Needs manual review',
      '',
      'Not confirmed violations, and not counted as violations above.',
      '',
      ...(incomplete.length === 0
        ? ['Nothing in the scanned states.', '']
        : withIncomplete.flatMap((entry) => renderState(entry, 'incomplete'))),
      '## Scanned states',
      '',
      '| # | State | Route | Test | Violations | Needs review | Rules passed |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      ...entries.map(
        (entry) =>
          `| ${entry.number} | ${prose(entry.record.state)} | ${code(entry.record.route)} | ${prose(entry.test)} | ${entry.record.violations.length} | ${entry.record.incomplete.length} | ${entry.record.passedRules} |`,
      ),
      '',
    ].join('\n');
  }
}

export default AccessibilityReporter;
