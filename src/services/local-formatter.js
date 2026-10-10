import { DateHelper } from '../utils/date.js';
import { getAiUsage, MARKETPLACE_TEMPLATE_ID } from './storage.js';
import { PRODUCTS } from '../utils/product.js';
import { fmtTime } from '../utils/time.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Format YYYY-MM-DD into "D Mon YYYY" (e.g. "16 May 2026").
 */
function formatHumanDate(yyyyMmDd) {
  if (!yyyyMmDd) return '';
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/**
 * Add `days` weekdays (Mon-Fri) to a YYYY-MM-DD date string.
 * Skips weekends. Returns YYYY-MM-DD.
 */
function addWeekdays(yyyyMmDd, days) {
  const d = new Date(`${yyyyMmDd}T00:00:00`);
  let remaining = days;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) remaining -= 1;
  }
  return DateHelper.formatDate(d);
}

/**
 * Parse a "30%" or "30% ➔ 50%" string and return the latest number.
 * Returns null when input is "N/A" or unparseable.
 */
function parsePercent(progressStr) {
  if (!progressStr || progressStr === 'N/A') return null;
  const matches = String(progressStr).match(/(\d+)\s*%/g);
  if (!matches || matches.length === 0) return null;
  return parseInt(matches[matches.length - 1], 10);
}

/**
 * Compute the estimated completion date for a Plan-for-Today task.
 * Uses 1.5 SP/day velocity over weekdays.
 *
 * @param {string} reportDate - report date in YYYY-MM-DD
 * @param {number} currentProgressPct - current %
 * @param {number} sp - story points
 * @returns {string|null} YYYY-MM-DD or null when SP/progress unknown
 */
function estimateCompletionDate(reportDate, currentProgressPct, sp) {
  if (!sp || sp <= 0 || currentProgressPct == null) return null;
  const remainingFraction = Math.max(0, 100 - currentProgressPct) / 100;
  if (remainingFraction === 0) return reportDate;
  const remainingSp = sp * remainingFraction;
  const days = Math.max(1, Math.ceil(remainingSp / 1.5));
  return addWeekdays(reportDate, days);
}

/**
 * Group rows by ParentSummary. Returns Map<parent, rows[]> preserving insertion order.
 */
function groupByParent(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const parent = row.ParentSummary || 'General Tasks';
    if (!map.has(parent)) map.set(parent, []);
    map.get(parent).push(row);
  }
  return map;
}

function isReviewCode(row) {
  return /review code/i.test(row.Reason || '');
}

function formatReviewCodeRow(row) {
  return [
    `  • ${row.TaskLink}: ${row.Title}`,
    `    ◦ Progress: 100%`,
    `    ◦ Review code`,
  ].join('\n');
}

function formatDoneYesterdayRow(row) {
  if (isReviewCode(row)) return formatReviewCodeRow(row);
  const pct = parsePercent(row.Progress);
  const lines = [`  • ${row.TaskLink}: ${row.Title}`];
  if (row.Progress && row.Progress !== 'N/A') {
    lines.push(`    ◦ Progress: ${row.Progress}`);
  }
  if (pct !== null && pct < 100) {
    lines.push(`    ◦ Remaining: <FILL REMAINING>`);
  }
  return lines.join('\n');
}

function formatProgressChangedRow(row) {
  if (isReviewCode(row)) return formatReviewCodeRow(row);
  const lines = [`  • ${row.TaskLink}: ${row.Title}`];
  if (row.Progress && row.Progress !== 'N/A') {
    lines.push(`    ◦ Progress: ${row.Progress}`);
  }
  const reason = (row.Reason || '').trim();
  lines.push(`    ◦ Reason: ${reason || '<fill in brief technical summary>'}`);
  return lines.join('\n');
}

function formatPlanForTodayRow(row, reportDate, platform) {
  const pct = parsePercent(row.Progress);
  const completionDate = estimateCompletionDate(reportDate, pct, row.SP);
  const completionLabel = completionDate ? formatHumanDate(completionDate) : 'TBD';
  const progressLabel = row.Progress && row.Progress !== 'N/A' ? row.Progress : 'TBD';
  const aiUsage = getAiUsage(platform, row.IssueType);
  return [
    `  • ${row.TaskLink}: ${row.Title}`,
    `    ◦ Progress: ${progressLabel} by EOD | Full task done: ${completionLabel}`,
    `    ◦ AI: ${aiUsage}`,
  ].join('\n');
}

function formatCategory(title, rows, lineFormatter) {
  if (!rows || rows.length === 0) return null;
  const groups = groupByParent(rows);
  const parts = [title];
  for (const [parent, parentRows] of groups) {
    parts.push(`${parent}`);
    for (const row of parentRows) {
      parts.push(lineFormatter(row));
    }
  }
  return parts.join('\n');
}

// ─── Backend Marketplace layout ──────────────────────────────────────────────

const MP_OTHERS_KEY = PRODUCTS.marketplace.othersTicketKey;

function keyOf(row) {
  return (row.TaskLink || '').match(/[A-Z][A-Z0-9]*-\d+/)?.[0] || '';
}

// Slack-style "url|KEY" reference, as used by the Marketplace template.
function linkRef(row) {
  return `${row.TaskLink}|${keyOf(row)}`;
}

function timeLabel(seconds) {
  return seconds > 0 ? `\`${fmtTime(seconds)}\`` : '`<fill in time>`';
}

function mpDescription(row) {
  return (row.Reason || '').trim() || row.Title;
}

function mpOthersHeader(domainLink) {
  return `• Others — ${domainLink}|${MP_OTHERS_KEY}`;
}

/**
 * Build "• Feature" groups (+ trailing "• Others" group) for a category.
 * `line(row)` renders the `◦` line; the Others ticket is pulled into its own group.
 */
function mpGroups(rows, line, othersLine) {
  const out = [];
  const others = [];
  const features = new Map();
  for (const row of rows || []) {
    if (keyOf(row) === MP_OTHERS_KEY) {
      others.push(row);
      continue;
    }
    const parent = row.ParentSummary || 'General Tasks';
    if (!features.has(parent)) features.set(parent, []);
    features.get(parent).push(row);
  }
  for (const [parent, list] of features) {
    out.push(`• ${parent}`);
    list.forEach((r) => out.push(`    ◦ ${line(r)}`));
  }
  for (const row of others) {
    out.push(mpOthersHeader(row.TaskLink));
    out.push(`    ◦ ${othersLine(row)}`);
  }
  return out;
}

function mpEstimate(row, hoursPerPoint) {
  const pct = parsePercent(row.Progress);
  if (!row.SP || row.SP <= 0 || pct == null) return '`<fill in time>`';
  const seconds = Math.round(row.SP * (Math.max(0, 100 - pct) / 100) * hoursPerPoint * 3600);
  return timeLabel(seconds);
}

function formatMarketplace(report, { displayName, targetDate, hoursPerPoint = 4 }) {
  const header = [
    `DAILY REPORT — ${formatHumanDate(targetDate)}`,
    `Name: ${displayName || 'Unknown'}`,
    'Platform: BE',
    "`I've already logged the time in Jira.`",
    '',
    '——————————————————',
  ].join('\n');

  const sections = [];

  const done = report?.['Done Yesterday'] || [];
  if (done.length) {
    sections.push(['DONE YESTERDAY', ...mpGroups(
      done,
      (r) => `${linkRef(r)} — ${mpDescription(r)} - ${timeLabel(r.TimeSeconds)} - ${r.Status || 'N/A'}`,
      (r) => `${mpDescription(r)} - ${timeLabel(r.TimeSeconds)}`,
    )].join('\n'));
  }

  // Progress is tracked per task; only rows whose % actually moved are listed.
  const moved = (report?.['Progress Changed'] || []).filter((r) => /%/.test(r.Progress || '') && r.Progress !== 'N/A');
  if (moved.length) {
    const lines = ['PROGRESS CHANGED'];
    for (const r of moved) {
      lines.push(`• ${r.ParentSummary || 'General Tasks'} — ${linkRef(r)}: ${r.Progress.replace(/➔|->/g, '→')}`);
    }
    sections.push(lines.join('\n'));
  }

  const plan = report?.['Plan for Today'] || [];
  if (plan.length) {
    sections.push(['PLAN FOR TODAY', ...mpGroups(
      plan,
      (r) => `${linkRef(r)} — ${r.Title} - Est ${mpEstimate(r, hoursPerPoint)}`,
      (r) => `${r.Title} - ${mpEstimate(r, hoursPerPoint)}`,
    )].join('\n'));
  }

  const footer = ['——————————————————', 'Blockers: None', 'At-risk: None', 'Questions: None'].join('\n');
  return [`${header}\n${sections.join('\n\n')}`, footer].join('\n\n');
}

export class LocalFormatter {
  /**
   * Render a categorised report (the JSON `ReportEngine.generate()` returns)
   * into a Slack/plain-text-friendly string, deterministically — no AI call.
   *
   * @param {object} report - { 'Done Yesterday': [...], 'Progress Changed': [...], 'Plan for Today': [...] }
   * @param {object} context
   * @param {string} context.displayName
   * @param {string} context.platform - e.g. "Backend", "QA"
   * @param {string} context.targetDate - report date in YYYY-MM-DD
   * @param {string} [context.templateId] - `default-backend-marketplace` selects the Marketplace layout
   * @param {number} [context.hoursPerPoint] - used for the Marketplace "Est" time
   */
  static formatReport(report, { displayName, platform, targetDate, templateId, hoursPerPoint }) {
    if (templateId === MARKETPLACE_TEMPLATE_ID) {
      return formatMarketplace(report, { displayName, targetDate, hoursPerPoint });
    }
    const header = [
      `DAILY REPORT — ${formatHumanDate(targetDate)}`,
      `Name: ${displayName || 'Unknown'}`,
      `Platform: ${platform || 'Unknown'}`,
      '——————————————————',
    ].join('\n');

    const sections = [
      formatCategory('DONE YESTERDAY', report?.['Done Yesterday'], formatDoneYesterdayRow),
      formatCategory('PROGRESS CHANGED', report?.['Progress Changed'], formatProgressChangedRow),
      formatCategory('PLAN FOR TODAY', report?.['Plan for Today'], (row) => formatPlanForTodayRow(row, targetDate, platform)),
    ].filter(Boolean);

    const footer = ['Blocker: None', 'At-risk: None', 'Question: None'].join('\n');

    return [`${header}\n${sections.join('\n\n')}`, footer].join('\n\n');
  }
}
