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
   *
   * Walks the `/users/{username}/events` feed page-by-page (newest-first) and
   * returns events whose `created_at` lands on `targetDate` after GMT+7
   * conversion. Stops early once the oldest event on a page is older than
   * `targetDate` (every subsequent page is older too).
   *
   * GitHub's events feed is capped at 10 pages of 100 events = 1000 events
   * total, ~90 days of history; older activity is not retrievable here.
   *
   * @param {string} username
   * @param {string} targetDate - YYYY-MM-DD in GMT+7
   * @param {string} token - GitHub PAT
   * @returns {Promise<object[]>} filtered events, newest-first
   */
  static async fetchEventsForDate(username, targetDate, token, allowedRepos = []) {
    const PER_PAGE = 100;
    const MAX_PAGES = 10; // GitHub's hard cap on the events feed
    const matches = [];

    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await fetch(
        `https://api.github.com/users/${username}/events?per_page=${PER_PAGE}&page=${page}`,
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
      if (!Array.isArray(events) || events.length === 0) break;

      for (const e of events) {
        const isCorrectDate = toGmt7DateStr(e.created_at) === targetDate;
        const isAllowedRepo = allowedRepos.length === 0 || allowedRepos.includes(e.repo?.name);
        if (isCorrectDate && isAllowedRepo) matches.push(e);
      }

      // Stop when the page's oldest event is already strictly older than the
      // target date — the rest of the feed only gets older.
      const oldest = events[events.length - 1];
      if (oldest && toGmt7DateStr(oldest.created_at) < targetDate) break;

      // Short page = last page in the feed.
      if (events.length < PER_PAGE) break;
    }

    return matches;
  }

  /**
   * Fetch a PR via the GitHub API and return its title + body.
   * Used as a fallback when an event payload lacks the title/body needed
   * to extract Jira ticket IDs (e.g. PullRequestReviewEvent often omits
   * the title and never includes the body in the events feed).
   *
   * Results are cached in the provided Map to avoid duplicate fetches
   * across multiple events on the same PR.
   *
   * @param {string} url - PR API URL (event.payload.pull_request.url)
   * @param {string} token
   * @param {Map<string, string>} cache - keyed by url, value is `${title} ${body}`
   * @returns {Promise<string>} combined title + body, or '' on failure
   */
  static async fetchPrText(url, token, cache) {
    if (!url) return '';
    if (cache.has(url)) return cache.get(url);
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
        },
      });
      if (!res.ok) {
        cache.set(url, '');
        return '';
      }
      const pr = await res.json();
      const text = (pr.title || '') + ' ' + (pr.body || '');
      cache.set(url, text);
      return text;
    } catch {
      cache.set(url, '');
      return '';
    }
  }

  /**
   * Extract Jira ticket map from GitHub events.
   * Events must be in oldest-first order — caller should reverse fetchEventsForDate result.
   * First event per ticket wins. Description is derived from event type + review history.
   *
   * For PR-related events, when no ticket ID is found in the event's title/branch,
   * the PR is fetched (when `token` is provided) so the body can be scanned too.
   *
   * @param {object[]} events - oldest-first
   * @param {{ timeCommit: number, timeApprove: number, timeComment: number }} timeConfig - seconds
   * @param {string} [token] - GitHub PAT, used for PR-body fallback
   * @returns {Promise<Map<string, { seconds: number, description: string }>>}
   */
  static async extractTicketMap(events, timeConfig, token) {
    const prTextCache = new Map();

    // Pre-pass: any PR event publishes a branch → title-IDs mapping. Push and
    // Create events on the same branch defer to this mapping, so a branch like
    // "feat/UP-70470" no longer overrides the PR's title (e.g. "UP-70323 ...").
    const branchToTitleIds = new Map();
    for (const event of events) {
      if (event.type !== 'PullRequestEvent'
          && event.type !== 'PullRequestReviewEvent'
          && event.type !== 'PullRequestReviewCommentEvent') continue;
      const pr = event.payload.pull_request;
      const branch = pr?.head?.ref;
      if (!branch || branchToTitleIds.has(branch)) continue;
      const titleIds = extractIds(pr?.title || '');
      if (titleIds.length > 0) branchToTitleIds.set(branch, titleIds);
    }

    const branchFromRef = (ref) => (ref || '').replace(/^refs\/heads\//, '');

    // Resolve a PR-event's ticket IDs with title > branch > PR body priority.
    // Title wins outright when it contains any ID, so a branch-only ID (often a
    // related-but-different ticket, e.g. a parent epic on the source branch)
    // does not get picked up alongside the title's ID.
    const resolvePrIds = async (event) => {
      const pr = event.payload.pull_request;
      const titleIds = extractIds(pr?.title || '');
      if (titleIds.length > 0) return titleIds;
      const branchIds = extractIds(pr?.head?.ref || '');
      if (branchIds.length > 0) return branchIds;
      if (!token || !pr?.url) return [];
      const remote = await GitHubService.fetchPrText(pr.url, token, prTextCache);
      return extractIds(remote);
    };

    // Pass 1: collect tickets from review-related events (PR opened/merged, review, comment)
    const reviewTickets = new Set();
    for (const event of events) {
      if (['PullRequestReviewEvent', 'PullRequestReviewCommentEvent', 'PullRequestEvent'].includes(event.type)) {
        const ids = await resolvePrIds(event);
        ids.forEach((id) => reviewTickets.add(id));
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
        const branch = branchFromRef(event.payload.ref);
        const msgs = (event.payload.commits || []).map((c) => c.message).join(' ');
        const mapped = branchToTitleIds.get(branch);
        if (mapped) {
          // Prefer the PR's title-derived IDs; still include any IDs the user
          // explicitly typed into commit messages.
          ticketIds = [...new Set([...mapped, ...extractIds(msgs)])];
        } else {
          ticketIds = extractIds(branch + ' ' + msgs);
        }
      }
      // CASE 2: Create branch
      else if (event.type === 'CreateEvent' && event.payload.ref_type === 'branch') {
        eventType = 'commit';
        eventSeconds = timeConfig.timeCommit;
        const branch = event.payload.ref || '';
        const mapped = branchToTitleIds.get(branch);
        ticketIds = mapped ? mapped : extractIds(branch);
      }
      // CASE 3: PR actions (opened, merged, reopened)
      else if (event.type === 'PullRequestEvent') {
        const action = event.payload.action;
        if (['opened', 'merged', 'reopened'].includes(action)) {
          eventType = 'review';
          eventSeconds = timeConfig.timeApprove;
          ticketIds = await resolvePrIds(event);
        }
      }
      // CASE 4: Review
      else if (event.type === 'PullRequestReviewEvent') {
        const state = event.payload.review?.state;
        eventType = 'review';
        eventSeconds = state === 'approved' ? timeConfig.timeApprove : timeConfig.timeComment;
        ticketIds = await resolvePrIds(event);
      }
      // CASE 5: Review comment
      else if (event.type === 'PullRequestReviewCommentEvent') {
        eventType = 'review';
        eventSeconds = timeConfig.timeComment;
        ticketIds = await resolvePrIds(event);
      }

      for (const id of ticketIds) {
        if (result.has(id)) continue; // first occurrence wins

        const description =
          eventType === 'review'      ? 'Review code' :
          reviewTickets.has(id)       ? 'Resolve comment feedbacks, write tests, write API docs, self-test' :
                                        'Implement based on solution design & implementation plan, self-review, self-test';

        result.set(id, { seconds: eventSeconds, description });
      }
    }

    return result;
  }

  /**
   * Check if a Jira ticket already has an [Generated by Log Work tool] worklog on targetDate.
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
        (l.comment?.content?.[0]?.content?.[0]?.text || '').includes('[Generated by Log Work tool]')
    );
  }
}
