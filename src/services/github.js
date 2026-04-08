const JIRA_ID = /[A-Z]+-\d+/g;

/**
 * Convert UTC date string to YYYY-MM-DD in GMT+7.
 */
function toGmt7DateStr(utcStr) {
  const utc = new Date(utcStr);
  const gmt7 = new Date(utc.getTime() + 7 * 60 * 60 * 1000);
  return gmt7.toISOString().slice(0, 10);
}

/**
 * Extract unique Jira ticket IDs from a string.
 */
function extractIds(str) {
  return [...new Set([...(str || '').matchAll(JIRA_ID)].map((m) => m[0]))];
}

export class GitHubService {
  /**
   * Fetch GitHub events for a user on a specific date (GMT+7).
   * @param {string} username
   * @param {string} targetDate - YYYY-MM-DD in GMT+7
   * @param {string} token - GitHub PAT
   * @returns {Promise<object[]>} filtered events, newest-first (as returned by GitHub)
   */
  static async fetchEventsForDate(username, targetDate, token, allowedRepos = []) {
    const res = await fetch(
      `https://api.github.com/users/${username}/events?per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
      }
    );
    if (!res.ok) {
      const msg = res.status === 401
        ? 'Invalid GitHub token. Please check your PAT in Settings.'
        : `GitHub API error: ${res.status} ${res.statusText}`;
      throw new Error(msg);
    }
    const events = await res.json();
    return events.filter((e) => {
      const isCorrectDate = toGmt7DateStr(e.created_at) === targetDate;
      const isAllowedRepo = allowedRepos.length === 0 || allowedRepos.includes(e.repo.name);
      return isCorrectDate && isAllowedRepo;
    });
  }

  /**
   * Extract Jira ticket map from GitHub events.
   * Events must be in oldest-first order — caller should reverse fetchEventsForDate result.
   * First event per ticket wins. Description is derived from event type + review history.
   *
   * @param {object[]} events - oldest-first
   * @param {{ timeCommit: number, timeApprove: number, timeComment: number }} timeConfig - seconds
   * @returns {Map<string, { seconds: number, description: string }>}
   */
  static extractTicketMap(events, timeConfig) {
    // Pass 1: collect tickets from review-related events (PR opened/merged, review, comment)
    const reviewTickets = new Set();
    for (const event of events) {
      if (['PullRequestReviewEvent', 'PullRequestReviewCommentEvent', 'PullRequestEvent'].includes(event.type)) {
        const pr = event.payload.pull_request;
        const text = (pr?.title || '') + ' ' + (pr?.head?.ref || '');
        extractIds(text).forEach((id) => reviewTickets.add(id));
      }
    }

    // Pass 2: first occurrence per ticket wins
    const result = new Map();

    for (const event of events) {
      let ticketIds = [];
      let eventType = null;
      let eventSeconds = 0;

      // CASE 1: Push code
      if (event.type === 'PushEvent') {
        eventType = 'commit';
        eventSeconds = timeConfig.timeCommit;
        const ref = event.payload.ref || '';
        const msgs = (event.payload.commits || []).map((c) => c.message).join(' ');
        ticketIds = extractIds(ref + ' ' + msgs);
      }
      // CASE 2: Create branch
      else if (event.type === 'CreateEvent' && event.payload.ref_type === 'branch') {
        eventType = 'commit';
        eventSeconds = timeConfig.timeCommit;
        ticketIds = extractIds(event.payload.ref || '');
      }
      // CASE 3: PR actions (opened, merged, reopened)
      else if (event.type === 'PullRequestEvent') {
        const action = event.payload.action;
        if (['opened', 'merged', 'reopened'].includes(action)) {
          eventType = 'review';
          eventSeconds = timeConfig.timeApprove;
          const pr = event.payload.pull_request;
          ticketIds = extractIds((pr?.title || '') + ' ' + (pr?.head?.ref || ''));
        }
      }
      // CASE 4: Review
      else if (event.type === 'PullRequestReviewEvent') {
        const state = event.payload.review?.state;
        eventType = 'review';
        eventSeconds = state === 'approved' ? timeConfig.timeApprove : timeConfig.timeComment;
        const pr = event.payload.pull_request;
        ticketIds = extractIds((pr?.title || '') + ' ' + (pr?.head?.ref || ''));
      }
      // CASE 5: Review comment
      else if (event.type === 'PullRequestReviewCommentEvent') {
        eventType = 'review';
        eventSeconds = timeConfig.timeComment;
        ticketIds = extractIds(event.payload.pull_request?.title || '');
      }

      for (const id of ticketIds) {
        if (result.has(id)) continue; // first occurrence wins

        const description =
          eventType === 'review'      ? 'Review code, discuss technical solutions' :
          reviewTickets.has(id)       ? 'Resolve comment feedbacks, write tests, write API docs, self-test' :
                                        'Implement based on solution design & implementation plan, self-review, self-test';

        result.set(id, { seconds: eventSeconds, description });
      }
    }

    return result;
  }

  /**
   * Check if a Jira ticket already has an [AI] worklog on targetDate.
   * @param {string} domain
   * @param {string} issueKey
   * @param {string} targetDate - YYYY-MM-DD
   * @param {string} myAccountId
   * @returns {Promise<boolean>}
   */
  static async isSynced(domain, issueKey, targetDate, myAccountId) {
    const res = await fetch(
      `https://${domain}/rest/api/3/issue/${issueKey}/worklog`,
      { credentials: 'include' }
    );
    if (!res.ok) return false;
    const data = await res.json();
    return (data.worklogs || []).some(
      (l) =>
        l.author.accountId === myAccountId &&
        l.started.startsWith(targetDate) &&
        (l.comment?.content?.[0]?.content?.[0]?.text || '').includes('[AI]')
    );
  }
}
