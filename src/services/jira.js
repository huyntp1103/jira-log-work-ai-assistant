/**
 * Walk an ADF (Atlassian Document Format) doc and concatenate all text nodes.
 * Returns '' for missing/non-ADF input.
 */
function extractCommentText(adf) {
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
   * Fetch a Jira issue by key. Returns null if not found.
   * Optionally restrict to a specific issue type (e.g. 'Epic').
   */
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

  static async searchJql(domain, jql, fields = []) {
    return this.fetchJira(domain, '/rest/api/3/search/jql', 'POST', {
      jql,
      fields,
      maxResults: 50,
    });
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

  static async createWorklog(domain, issueKey, { timeSpentSeconds, targetDate, description }) {
    return this.fetchJira(domain, `/rest/api/3/issue/${issueKey}/worklog`, 'POST', {
      timeSpentSeconds,
      started: `${targetDate}T12:00:00.000+0700`,
      comment: {
        type: 'doc',
        version: 1,
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: `[Generated by Log Work tool] ${description}` }],
        }],
      },
    });
  }
}
