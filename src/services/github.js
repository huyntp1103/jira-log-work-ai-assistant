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
  static async fetchEventsForDate(username, targetDate, token) {
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
    return events.filter((e) => toGmt7DateStr(e.created_at) === targetDate);
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
    // First pass: collect all ticket IDs that appear in review events
    const reviewTickets = new Set();
    for (const event of events) {
      if (
        event.type === 'PullRequestReviewEvent' ||
        event.type === 'PullRequestReviewCommentEvent'
      ) {
        const title = event.payload.pull_request?.title || '';
        const branch = event.payload.pull_request?.head?.ref || '';
        extractIds(title + ' ' + branch).forEach((id) => reviewTickets.add(id));
      }
    }

    // Second pass: first occurrence per ticket wins
    const result = new Map();

    for (const event of events) {
      let ticketIds = [];
      let eventType = null;
      let eventSeconds = 0;

      if (event.type === 'PushEvent') {
        eventType = 'commit';
        eventSeconds = timeConfig.timeCommit;
        const ref = event.payload.ref || '';
        const msgs = (event.payload.commits || []).map((c) => c.message).join(' ');
        ticketIds = extractIds(ref + ' ' + msgs);
      } else if (event.type === 'PullRequestReviewEvent') {
        const state = event.payload.review?.state;
        eventType = 'review';
        eventSeconds = state === 'approved' ? timeConfig.timeApprove : timeConfig.timeComment;
        const title = event.payload.pull_request?.title || '';
        const branch = event.payload.pull_request?.head?.ref || '';
        ticketIds = extractIds(title + ' ' + branch);
      } else if (event.type === 'PullRequestReviewCommentEvent') {
        eventType = 'review';
        eventSeconds = timeConfig.timeComment;
        const title = event.payload.pull_request?.title || '';
        ticketIds = extractIds(title);
      }

      for (const id of ticketIds) {
        if (result.has(id)) continue; // first occurrence wins

        let description;
        if (eventType === 'review') {
          description = 'Review code';
        } else if (reviewTickets.has(id)) {
          description = 'Resolve comment feedbacks, write tests, write API docs, self-test';
        } else {
          description = 'Implement based on solution design & implementation plan, self-review, self-test';
        }

        result.set(id, { seconds: eventSeconds, description });
      }
    }

    return result;
  }

  /**
   * Check if a Jira ticket already has an [Everport-AI] worklog on targetDate.
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
        (l.comment?.content?.[0]?.content?.[0]?.text || '').includes('[Everport-AI]')
    );
  }
}
