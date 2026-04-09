import { JiraService } from './jira.js';
import { DateHelper } from '../utils/date.js';
import { calculateProgress, currentProgress } from '../utils/progress.js';

export class ReportEngine {
  /**
   * @param {object} config
   * @param {string} config.domain - Jira domain (e.g. "company.atlassian.net")
   * @param {string} config.myId - Current user's accountId
   * @param {string} config.targetDate - YYYY-MM-DD worklog date
   * @param {Date}   config.baseDate - Base date for 14-day recency filter
   * @param {string} config.spField - Story point custom field ID
   * @param {number} config.hoursPerPoint - Hours per story point
   */
  constructor({ domain, myId, targetDate, baseDate, spField, hoursPerPoint }) {
    this.domain = domain;
    this.myId = myId;
    this.targetDate = targetDate;
    this.baseDate = baseDate;
    this.spField = spField;
    this.hoursPerPoint = hoursPerPoint;
    this.report = {
      'Done Yesterday': [],
      'Progress Changed': [],
      'Plan for Today': [],
    };
  }

  async generate() {
    const twoWeeksAgo = new Date(this.baseDate);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const twoWeeksAgoStr = DateHelper.formatDate(twoWeeksAgo);

    const fields = ['summary', 'status', 'worklog', 'timetracking', 'parent', this.spField];

    const [logData, planData] = await Promise.all([
      JiraService.searchJql(
        this.domain,
        `worklogAuthor = currentUser() AND worklogDate = "${this.targetDate}"`,
        fields
      ),
      JiraService.searchJql(
        this.domain,
        `assignee = currentUser() AND sprint in openSprints() AND status in ("In Progress", "In Review", "QA FAILED") AND created >= "${twoWeeksAgoStr}"`,
        fields
      ),
    ]);

    const loggedIssueKeys = new Set();

    const getParentSummary = (issue) =>
      issue.fields.parent ? issue.fields.parent.fields.summary : 'General Tasks';

    // Parse a Jira `started` ISO string to YYYY-MM-DD in LOCAL time.
    // Jira returns the offset it stored (e.g. +0700), so new Date() correctly
    // converts to the browser's local timezone — matching the user's profile timezone.
    const toLocalDateStr = (isoStr) => {
      const d = new Date(isoStr);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    logData.issues.forEach((issue) => {
      const myLogs = issue.fields.worklog.worklogs.filter(
        (l) => l.author.accountId === this.myId
      );
      const targetLogs = myLogs.filter((l) => toLocalDateStr(l.started) === this.targetDate);
      const secondsOnTarget = targetLogs.reduce((acc, l) => acc + l.timeSpentSeconds, 0);

      // Skip issues where no actual time was logged on targetDate (can appear due to
      // Jira's JQL worklogDate matching differently from the stored started timestamp).
      if (secondsOnTarget === 0) return;

      loggedIssueKeys.add(issue.key);

      const hasLoggedBefore = myLogs.some((l) => toLocalDateStr(l.started) < this.targetDate);
      const category = hasLoggedBefore ? 'Progress Changed' : 'Done Yesterday';

      // Use only MY worklogs for progress, not all users' (QA may also log time)
      const totalSpentSeconds = myLogs.reduce((acc, l) => acc + l.timeSpentSeconds, 0);
      const sp = issue.fields[this.spField] || 0;

      this.report[category].push({
        TaskLink: `https://${this.domain}/browse/${issue.key}`,
        Title: issue.fields.summary,
        ParentSummary: getParentSummary(issue),
        Time: (secondsOnTarget / 3600).toFixed(2) + 'h',
        Progress: calculateProgress(totalSpentSeconds, secondsOnTarget, sp, this.hoursPerPoint, issue.fields.status.name),
        Status: issue.fields.status.name,
      });
    });

    planData.issues.forEach((issue) => {
      if (!loggedIssueKeys.has(issue.key)) {
        const sp = issue.fields[this.spField] || 0;
        const worklogs = issue.fields.worklog?.worklogs || [];
        const myTotalSpent = worklogs
          .filter((l) => l.author.accountId === this.myId)
          .reduce((acc, l) => acc + l.timeSpentSeconds, 0);
        const status = issue.fields.status.name;

        this.report['Plan for Today'].push({
          TaskLink: `https://${this.domain}/browse/${issue.key}`,
          Title: issue.fields.summary,
          ParentSummary: getParentSummary(issue),
          Status: status,
          SP: sp,
          Progress: currentProgress(myTotalSpent, sp, this.hoursPerPoint, status) + '%',
        });
      }
    });
    console.log('Generated report data:', this.report);
    return this.report;
  }
}
