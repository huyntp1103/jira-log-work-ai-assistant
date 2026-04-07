# GitHub Activity Sync — Feature Spec (Everport AI)

## Overview

Integrate GitHub user activity to automatically create Jira worklogs, eliminating manual time-entry after code contributions.

---

## Core Concept

1. User provides a GitHub PAT → stored in `chrome.storage.local` (not sync, sensitive token).
2. On demand, `GitHubService` fetches the user's GitHub events for the target date (UTC→GMT+7 converted).
3. Jira ticket IDs are extracted from branch names, commit messages, and PR titles via regex (e.g. `UP-67890`).
4. **Skip already-synced tickets:** before writing, check existing worklogs — if a ticket already has an `[Everport-Sync]` log on the target date, skip it entirely. No overwrite, no delete.
5. A **3-column Preview Table** is shown before any write: Ticket ID (editable) | Time (editable) | Description.
6. On confirm, worklogs are created in Jira via `POST /rest/api/3/issue/{key}/worklog`.

---

## Time Config (defaults, user-adjustable in Settings)

| Event Type         | Default Time |
|--------------------|-------------|
| Commit pushed      | 60 min      |
| PR review approved | 15 min      |
| PR review comment  | 15 min      |

---

## Worklog Description Logic (No Gemini)

Description is determined by the **dominant event type** for the ticket:

| Dominant Event | Description |
|----------------|-------------|
| Review / Approve | `Review code` |
| Commit (first-time on ticket, no prior review comments) | `Implement based on solution design & implementation plan, self-review, self-test` |
| Commit (ticket has prior review comment events) | `Resolve comment feedbacks, write tests, write API docs, self-test` |

> "Dominant" = event type with highest total time contribution for that ticket.

---

## Skip-If-Synced (Idempotency)

- Before building the preview, fetch existing worklogs for each candidate ticket.
- If any worklog on `targetDate` contains `[Everport-Sync]` in its comment, exclude that ticket from the preview entirely.
- This prevents double-logging without requiring a delete step.
- Newly created worklogs always include `[Everport-Sync]` in the comment for future detection.

---

## Date Matching & Timezone

GitHub events are returned in UTC. Convert to GMT+7 before comparing to the user-selected `targetDate`. Events outside the target date (in GMT+7) are ignored.

---

## Coexistence with Manual Logs

- Only `[Everport-Sync]`-tagged worklogs are relevant to this feature's idempotency check.
- Manually created worklogs (no tag) are never touched or deleted.

---

## Preview Table (UI)

Before writing to Jira, show a confirmation table:

| Ticket ID (editable) | Time (editable) | Description |
|----------------------|-----------------|-------------|
| UP-67890             | 2h 15m          | Implement based on solution design & implementation plan, self-review, self-test |
| UP-65432             | 20m             | Review code |

- User can edit ticket ID (in case regex extracted wrong key) or time before confirming.
- Tickets already synced today are excluded — not shown in table.
- "Sync to Jira" button triggers worklog writes for all visible rows.

---

## Service: `GitHubService`

```
src/services/github.js
```

Key methods:

```javascript
/**
 * Fetch GitHub events for a user on a specific date (converted from UTC to GMT+7).
 * @param {string} username - GitHub username
 * @param {string} targetDate - YYYY-MM-DD in GMT+7
 * @param {string} token - GitHub PAT
 * @returns {Promise<GitHubEvent[]>}
 */
async fetchEventsForDate(username, targetDate, token) {
  const res = await fetch(`https://api.github.com/users/${username}/events?per_page=100`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  const events = await res.json();

  return events.filter((e) => {
    const utcDate = new Date(e.created_at);
    // Convert UTC → GMT+7
    const gmt7 = new Date(utcDate.getTime() + 7 * 60 * 60 * 1000);
    const dateStr = gmt7.toISOString().slice(0, 10); // "YYYY-MM-DD"
    return dateStr === targetDate;
  });
}

/**
 * Extract Jira ticket IDs from event payload (branch, commit msg, PR title).
 * Only the FIRST event per ticket is logged — subsequent events are ignored.
 * Regex: /[A-Z]+-\d+/g
 * @param {GitHubEvent[]} events - ordered oldest→newest (GitHub returns newest first, so reverse before calling)
 * @param {object} timeConfig - { timeCommit, timeApprove, timeComment } in seconds
 * @returns {Map<string, { seconds: number, eventType: 'commit' | 'review' }>}
 */
extractTicketMap(events, timeConfig) {
  const JIRA_ID = /[A-Z]+-\d+/g;
  const result = new Map(); // key → { seconds, eventType } — first occurrence wins

  for (const event of events) {
    let ticketIds = [];
    let eventType = null;
    let eventSeconds = 0;

    if (event.type === 'PushEvent') {
      eventType = 'commit';
      eventSeconds = timeConfig.timeCommit;
      const ref = event.payload.ref || '';
      const msgs = (event.payload.commits || []).map((c) => c.message).join(' ');
      ticketIds = [...new Set([...ref.matchAll(JIRA_ID), ...msgs.matchAll(JIRA_ID)].map((m) => m[0]))];
    } else if (event.type === 'PullRequestReviewEvent') {
      const state = event.payload.review?.state;
      eventType = 'review';
      eventSeconds = state === 'approved' ? timeConfig.timeApprove : timeConfig.timeComment;
      const title = event.payload.pull_request?.title || '';
      const branch = event.payload.pull_request?.head?.ref || '';
      ticketIds = [...new Set([...title.matchAll(JIRA_ID), ...branch.matchAll(JIRA_ID)].map((m) => m[0]))];
    } else if (event.type === 'PullRequestReviewCommentEvent') {
      eventType = 'review';
      eventSeconds = timeConfig.timeComment;
      const title = event.payload.pull_request?.title || '';
      ticketIds = [...new Set([...title.matchAll(JIRA_ID)].map((m) => m[0]))];
    }

    for (const id of ticketIds) {
      if (!result.has(id)) {
        // First occurrence only — skip if already recorded
        result.set(id, { seconds: eventSeconds, eventType });
      }
    }
  }

  return result;
}

/**
 * Check if a ticket already has an [Everport-Sync] worklog on targetDate (GMT+7).
 * @param {string} domain - Jira domain
 * @param {string} issueKey
 * @param {string} targetDate - YYYY-MM-DD
 * @param {string} myAccountId
 * @returns {Promise<boolean>}
 */
async isSynced(domain, issueKey, targetDate, myAccountId) {
  const res = await fetch(`https://${domain}/rest/api/3/issue/${issueKey}/worklog`, {
    credentials: 'include',
  });
  const data = await res.json();
  return (data.worklogs || []).some(
    (l) =>
      l.author.accountId === myAccountId &&
      l.started.startsWith(targetDate) &&
      (l.comment?.content?.[0]?.content?.[0]?.text || '').includes('[Everport-Sync]')
  );
}
```

---

## Storage Changes

- `chrome.storage.local`: `{ githubToken: string, githubUsername: string }`
- `chrome.storage.sync` settings: `timeCommit` (seconds), `timeApprove` (seconds), `timeComment` (seconds)

Default values to add to `DEFAULT_SETTINGS` in `storage.js`:
```js
timeCommit: 3600,   // 60 min
timeApprove: 1200,  // 20 min
timeComment: 900,   // 15 min
```

---

## Background Message Protocol (additions)

```
Popup → Background: { type: 'GITHUB_SYNC_PREVIEW', date }
Background → Popup: { type: 'GITHUB_SYNC_DATA', rows: [{key, seconds, description}] }

Popup → Background: { type: 'GITHUB_SYNC_CONFIRM', worklogs: [{key, seconds, description}] }
Background → Popup: { type: 'GITHUB_SYNC_DONE', count }
Background → Popup: { type: 'GITHUB_SYNC_ERROR', error }
```

---

## Worklog Write Payload

```js
// POST https://{domain}/rest/api/3/issue/{key}/worklog
{
  timeSpentSeconds: seconds,
  started: `${targetDate}T09:00:00.000+0700`,
  comment: {
    type: 'doc',
    version: 1,
    content: [{
      type: 'paragraph',
      content: [{ type: 'text', text: `${description} [Everport-Sync]` }]
    }]
  }
}
```

---

## Implementation Phases

1. **`github.js`** — pure service: `fetchEventsForDate`, `extractTicketMap`, `isSynced`.
2. **Settings UI** — GitHub PAT + username fields; time config inputs (commit/approve/comment minutes).
3. **Background handlers** — GITHUB_SYNC_PREVIEW (fetch events → filter synced → build rows) and GITHUB_SYNC_CONFIRM (write worklogs).
4. **`GitHubSyncPanel.jsx`** — Preview table with editable rows + "Sync to Jira" button.

---

## Decisions

- **"Commit with prior review" heuristic:** check GitHub event history — if the ticket already has a `PullRequestReviewEvent` or `PullRequestReviewCommentEvent` in the fetched events (same target date), the commit description becomes `Resolve comment feedbacks, write tests, write API docs, self-test`.
- **GitHub PAT scope:** `read:user` + no special scope for public repos. Private repo events require `repo` scope. User must configure accordingly.
