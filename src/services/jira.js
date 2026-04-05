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

  static async getMyId(domain) {
    const user = await this.fetchJira(domain, '/rest/api/3/myself');
    return user.accountId;
  }

  static async searchJql(domain, jql, fields = []) {
    return this.fetchJira(domain, '/rest/api/3/search/jql', 'POST', {
      jql,
      fields,
      maxResults: 50,
    });
  }
}
