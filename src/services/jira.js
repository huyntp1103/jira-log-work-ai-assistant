/**
 * Walk an ADF (Atlassian Document Format) doc and concatenate all text nodes.
 * Returns '' for missing/non-ADF input.
 */
export function extractCommentText(adf) {
  if (!adf) return '';
  if (typeof adf === 'string') return adf;
  const parts = [];
  const walk = (node) => {
    if (!node) return;
    if (typeof node.text === 'string') parts.push(node.text);
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };
  walk(adf);
  return parts.join(' ').trim();
}

export class JiraService {
  static async fetchJira(domain, endpoint, method = 'GET', body = null) {
    const url = `https://${domain}${endpoint}`;
    const options = {
      method,
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Atlassian-Token': 'no-check',
      },
    };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(url, options);
    if (!res.ok) {
      throw new Error(`Jira API error: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  /**
   * Fetch a Jira version (release) by numeric id.
   * Returns null if not found.
   */
  static async getVersion(domain, id) {
    try {
      return await this.fetchJira(domain, `/rest/api/3/version/${id}`);
    } catch {
      return null;
    }
  }

  /**
   * Fetch an Agile board by id (`/rest/agile/1.0/board/{id}`). Returns null if not found.
   */
  static async getBoard(domain, id) {
    try {
      return await this.fetchJira(domain, `/rest/agile/1.0/board/${id}`);
    } catch {
      return null;
    }
  }

  /**
   * Find the currently-active sprint for a board. Returns the first active sprint
   * (most boards have at most one) or null if none.
   */
  static async getActiveSprintForBoard(domain, boardId) {
    try {
      const data = await this.fetchJira(
        domain,
        `/rest/agile/1.0/board/${boardId}/sprint?state=active`
      );
      return (data.values || [])[0] || null;
    } catch {
      return null;
    }
  }

  /**
   * Fetch a Jira issue by key. Returns null if not found.
   * Optionally restrict to a specific issue type (e.g. 'Epic').
   */
  /**
   * List the available workflow transitions for an issue.
   * Returns `[{ id, name, to: { name } }]`.
   */
  static async getTransitions(domain, key) {
    const data = await this.fetchJira(domain, `/rest/api/3/issue/${key}/transitions`);
    return data.transitions || [];
  }

  /**
   * Execute a workflow transition. Jira returns 204 No Content, so this
   * bypasses fetchJira (which assumes a JSON body).
   */
  static async transitionIssue(domain, key, transitionId) {
    const res = await fetch(`https://${domain}/rest/api/3/issue/${key}/transitions`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Atlassian-Token': 'no-check',
      },
      body: JSON.stringify({ transition: { id: transitionId } }),
    });
    if (!res.ok) {
      throw new Error(`Jira API error: ${res.status} ${res.statusText}`);
    }
  }

  static async getIssue(domain, key, requiredType = null) {
    try {
      const issue = await this.fetchJira(domain, `/rest/api/3/issue/${key}?fields=summary,issuetype,status`);
      if (requiredType && issue.fields?.issuetype?.name !== requiredType) return null;
      return issue;
    } catch {
      return null;
    }
  }

  static async getMyProfile(domain) {
    const user = await this.fetchJira(domain, '/rest/api/3/myself');
    return {
      accountId: user.accountId,
      displayName: (user.displayName || 'Unknown').split('(')[0].trim(),
    };
  }

  /**
   * Run a JQL search against the enhanced `/rest/api/3/search/jql` endpoint
   * and follow `nextPageToken` until all pages have been collected.
   *
   * The endpoint is paginated and caps `maxResults` at 100 per request, so
   * without this loop any tracker with > maxResults matching issues was being
   * silently truncated.
   *
   * Returns the merged shape `{ issues: [...] }` (other top-level fields from
   * the last page are preserved for forward-compat). A hard `maxPages` cap
   * protects against runaway loops if the server keeps returning a token.
   */
  static async searchJql(domain, jql, fields = [], { pageSize = 100, maxPages = 20 } = {}) {
    const allIssues = [];
    let nextPageToken;
    let lastPage = {};

    for (let page = 0; page < maxPages; page++) {
      const body = { jql, fields, maxResults: pageSize };
      if (nextPageToken) body.nextPageToken = nextPageToken;

      const data = await this.fetchJira(domain, '/rest/api/3/search/jql', 'POST', body);
      lastPage = data;
      if (Array.isArray(data.issues)) allIssues.push(...data.issues);

      if (!data.nextPageToken) break;
      nextPageToken = data.nextPageToken;
    }

    return { ...lastPage, issues: allIssues };
  }

  /**
   * Fetch the current user's worklogs on a given date (YYYY-MM-DD, GMT+7).
   * Returns a flat list of { key, summary, timeSpentSeconds, started, comment }
   * sorted by `started` ascending.
   *
   * @param {string} domain
   * @param {string} accountId - the user's Jira accountId
   * @param {string} date - YYYY-MM-DD
   */
  /**
   * For each issue, resolve its full set of worklogs for the target date.
   * If the embedded `worklog.worklogs` array hit the 20-item cap, re-fetch via
   * `/rest/api/3/issue/{key}/worklog?startedAfter=...&startedBefore=...` so
   * recent worklogs aren't truncated.
   *
   * Returns the same issue objects with `fields.worklog.worklogs` replaced.
   *
   * @param {string} domain
   * @param {object[]} issues - issues from a JQL search that requested `worklog`
   * @param {string} date - YYYY-MM-DD (GMT+7)
   */
  static async resolveWorklogsForDate(domain, issues, date) {
    const dayStartMs = new Date(`${date}T00:00:00+0700`).getTime();
    const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;

    return Promise.all(
      (issues || []).map(async (issue) => {
        const embedded = issue.fields?.worklog?.worklogs || [];
        if (embedded.length < 20) return issue;
        try {
          const wl = await this.fetchJira(
            domain,
            `/rest/api/3/issue/${issue.key}/worklog?startedAfter=${dayStartMs}&startedBefore=${dayEndMs}`
          );
          return {
            ...issue,
            fields: {
              ...issue.fields,
              worklog: { worklogs: wl.worklogs || embedded },
            },
          };
        } catch {
          return issue;
        }
      })
    );
  }

  static async fetchMyWorklogs(domain, accountId, date) {
    const data = await this.searchJql(
      domain,
      `worklogAuthor = currentUser() AND worklogDate = "${date}"`,
      ['summary', 'worklog']
    );

    const issues = await this.resolveWorklogsForDate(domain, data.issues || [], date);

    const rows = [];
    for (const issue of issues) {
      for (const l of issue.fields?.worklog?.worklogs || []) {
        if (l.author?.accountId !== accountId) continue;
        // Local-time match — Jira `started` carries +0700, parse via Date
        const d = new Date(l.started);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        if (`${yyyy}-${mm}-${dd}` !== date) continue;

        rows.push({
          id: l.id,
          key: issue.key,
          summary: issue.fields.summary || '',
          timeSpentSeconds: l.timeSpentSeconds,
          started: l.started,
          comment: extractCommentText(l.comment),
        });
      }
    }

    rows.sort((a, b) => new Date(a.started) - new Date(b.started));
    return rows;
  }

  /**
   * Update an existing worklog's timeSpent and/or comment.
   * The comment is wrapped in ADF; the prefix `[Generated by Log Work tool]` is
   * intentionally NOT added here, so user-edited comments stay clean.
   */
  static async updateWorklog(domain, issueKey, worklogId, { timeSpentSeconds, comment }) {
    const body = {};
    if (timeSpentSeconds != null) body.timeSpentSeconds = timeSpentSeconds;
    if (comment != null) {
      body.comment = {
        type: 'doc',
        version: 1,
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: comment }],
        }],
      };
    }
    return this.fetchJira(domain, `/rest/api/3/issue/${issueKey}/worklog/${worklogId}`, 'PUT', body);
  }

  /**
   * Create a worklog on a Jira issue.
   *
   * @param {string} domain
   * @param {string} issueKey
   * @param {object} opts
   * @param {number} opts.timeSpentSeconds
   * @param {string} opts.targetDate - YYYY-MM-DD
   * @param {string} opts.description
   * @param {boolean} [opts.addToolPrefix=false] - prepend "[Generated by Log Work tool] "
   *   to the comment text. Used by the GitHub Sync flow so that
   *   `GitHubService.isSynced` can detect and skip already-synced worklogs.
   *   User-created worklogs (from the Daily Report tab) should leave this false
   *   so their comments stay clean.
   */
  static async createWorklog(domain, issueKey, { timeSpentSeconds, targetDate, description, addToolPrefix = false }) {
    const text = addToolPrefix ? `[Generated by Log Work tool] ${description}` : description;
    return this.fetchJira(domain, `/rest/api/3/issue/${issueKey}/worklog`, 'POST', {
      timeSpentSeconds,
      started: `${targetDate}T12:00:00.000+0700`,
      comment: {
        type: 'doc',
        version: 1,
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text }],
        }],
      },
    });
  }

  /**
   * List Jira tickets the user has logged time on within the last `days` days
   * (relative to today, server time). Returns deduplicated `[{ key, summary }]`,
   * most-recently-active first.
   */
  /**
   * Create a new Jira issue.
   *
   * @param {string} domain
   * @param {object} opts
   * @param {string} opts.projectKey
   * @param {string} opts.summary
   * @param {string} [opts.description]      Plain text; wrapped into ADF.
   * @param {string} opts.issueType          e.g. 'Task' | 'Bug'
   * @param {string} [opts.priorityName]     e.g. 'Medium'
   * @param {string} [opts.assigneeAccountId]
   * @param {string} [opts.parentKey]        Epic key (for Epic linkage on Jira Cloud).
   * @param {number} [opts.storyPoints]
   * @param {string} [opts.spField]          Custom field id for story points.
   * @param {string[]} [opts.fixVersionIds]
   * @returns {Promise<{ id: string, key: string }>}
   */
  static async createIssue(domain, opts) {
    const fields = {
      project: { key: opts.projectKey },
      summary: opts.summary,
      issuetype: { name: opts.issueType },
    };
    if (opts.description) {
      fields.description = {
        type: 'doc',
        version: 1,
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: opts.description }],
        }],
      };
    }
    if (opts.priorityName) fields.priority = { name: opts.priorityName };
    if (opts.assigneeAccountId) fields.assignee = { accountId: opts.assigneeAccountId };
    if (opts.parentKey) fields.parent = { key: opts.parentKey };
    if (opts.storyPoints != null && opts.spField) fields[opts.spField] = opts.storyPoints;
    if (opts.fixVersionIds?.length) fields.fixVersions = opts.fixVersionIds.map((id) => ({ id }));

    return this.fetchJira(domain, '/rest/api/3/issue', 'POST', { fields });
  }

  static async fetchRecentTickets(domain, accountId, days = 7) {
    const data = await this.searchJql(
      domain,
      `worklogAuthor = currentUser() AND worklogDate >= -${days}d ORDER BY updated DESC`,
      ['summary', 'worklog']
    );
    // Sort by each issue's most-recent user-worklog timestamp so the dropdown
    // surfaces what the user has touched most recently.
    const enriched = (data.issues || []).map((issue) => {
      const lastTs = (issue.fields?.worklog?.worklogs || [])
        .filter((l) => l.author?.accountId === accountId)
        .reduce((max, l) => Math.max(max, new Date(l.started).getTime()), 0);
      return { key: issue.key, summary: issue.fields.summary || '', lastTs };
    });
    enriched.sort((a, b) => b.lastTs - a.lastTs);
    return enriched.map(({ key, summary }) => ({ key, summary }));
  }
}
