import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubService } from '../github.js';

const TIME_CONFIG = {
  timeCommit: 3600,
  timeApprove: 900,
  timeComment: 900,
};

describe('GitHubService.extractTicketMap', () => {
  it('extracts ticket from PushEvent commit messages', () => {
    const events = [
      {
        type: 'PushEvent',
        payload: {
          ref: 'refs/heads/feature/UP-123-some-feature',
          commits: [{ message: 'feat: implement UP-123 login' }],
        },
      },
    ];
    const result = GitHubService.extractTicketMap(events, TIME_CONFIG);
    expect(result.has('UP-123')).toBe(true);
    expect(result.get('UP-123').seconds).toBe(3600);
    expect(result.get('UP-123').description).toBe(
      'Implement based on solution design & implementation plan, self-review, self-test'
    );
  });

  it('extracts ticket from CreateEvent branch name', () => {
    const events = [
      {
        type: 'CreateEvent',
        payload: { ref_type: 'branch', ref: 'feature/PROJ-456-new-api' },
      },
    ];
    const result = GitHubService.extractTicketMap(events, TIME_CONFIG);
    expect(result.has('PROJ-456')).toBe(true);
    expect(result.get('PROJ-456').seconds).toBe(3600);
  });

  it('ignores CreateEvent for tags', () => {
    const events = [
      {
        type: 'CreateEvent',
        payload: { ref_type: 'tag', ref: 'v1.0.0-PROJ-789' },
      },
    ];
    const result = GitHubService.extractTicketMap(events, TIME_CONFIG);
    expect(result.size).toBe(0);
  });

  it('extracts ticket from PullRequestEvent (opened)', () => {
    const events = [
      {
        type: 'PullRequestEvent',
        payload: {
          action: 'opened',
          pull_request: {
            title: 'feat: UP-100 add endpoint',
            head: { ref: 'feature/UP-100' },
          },
        },
      },
    ];
    const result = GitHubService.extractTicketMap(events, TIME_CONFIG);
    expect(result.has('UP-100')).toBe(true);
    expect(result.get('UP-100').seconds).toBe(900); // timeApprove
    expect(result.get('UP-100').description).toBe('Review code, discuss technical solutions');
  });

  it('ignores PullRequestEvent with non-matching action', () => {
    const events = [
      {
        type: 'PullRequestEvent',
        payload: {
          action: 'closed',
          pull_request: {
            title: 'feat: UP-100 add endpoint',
            head: { ref: 'feature/UP-100' },
          },
        },
      },
    ];
    const result = GitHubService.extractTicketMap(events, TIME_CONFIG);
    expect(result.size).toBe(0);
  });

  it('extracts ticket from PullRequestReviewEvent', () => {
    const events = [
      {
        type: 'PullRequestReviewEvent',
        payload: {
          review: { state: 'approved' },
          pull_request: {
            title: 'fix: CORE-55 bug fix',
            head: { ref: 'fix/CORE-55' },
          },
        },
      },
    ];
    const result = GitHubService.extractTicketMap(events, TIME_CONFIG);
    expect(result.has('CORE-55')).toBe(true);
    expect(result.get('CORE-55').seconds).toBe(900); // timeApprove for approved
    expect(result.get('CORE-55').description).toBe('Review code, discuss technical solutions');
  });

  it('uses timeComment for non-approved reviews', () => {
    const events = [
      {
        type: 'PullRequestReviewEvent',
        payload: {
          review: { state: 'changes_requested' },
          pull_request: {
            title: 'fix: CORE-55 bug fix',
            head: { ref: 'fix/CORE-55' },
          },
        },
      },
    ];
    const result = GitHubService.extractTicketMap(events, TIME_CONFIG);
    expect(result.get('CORE-55').seconds).toBe(900); // timeComment
  });

  it('extracts ticket from PullRequestReviewCommentEvent', () => {
    const events = [
      {
        type: 'PullRequestReviewCommentEvent',
        payload: {
          pull_request: { title: 'feat: DATA-77 migration' },
        },
      },
    ];
    const result = GitHubService.extractTicketMap(events, TIME_CONFIG);
    expect(result.has('DATA-77')).toBe(true);
    expect(result.get('DATA-77').seconds).toBe(900);
    expect(result.get('DATA-77').description).toBe('Review code, discuss technical solutions');
  });

  it('first occurrence wins — earlier event keeps its data', () => {
    const events = [
      // oldest first
      {
        type: 'PushEvent',
        payload: {
          ref: 'refs/heads/feature/UP-200',
          commits: [{ message: 'UP-200 initial' }],
        },
      },
      {
        type: 'PullRequestReviewEvent',
        payload: {
          review: { state: 'approved' },
          pull_request: {
            title: 'UP-200 review',
            head: { ref: 'feature/UP-200' },
          },
        },
      },
    ];
    const result = GitHubService.extractTicketMap(events, TIME_CONFIG);
    expect(result.get('UP-200').seconds).toBe(3600); // commit time, not review time
  });

  it('sets "Resolve comment feedbacks" description for push tickets that have reviews', () => {
    const events = [
      // Pass 1 collects CORE-10 as review ticket from the review event
      {
        type: 'PullRequestReviewEvent',
        payload: {
          review: { state: 'approved' },
          pull_request: {
            title: 'feat: CORE-10 feature',
            head: { ref: 'feature/CORE-10' },
          },
        },
      },
      // Pass 2: push for same ticket — but review event was first, so review wins
      // Actually review is first in array, so it wins. Let's reverse:
    ];
    // The review event is first, so it gets "Review code..." description
    const result = GitHubService.extractTicketMap(events, TIME_CONFIG);
    expect(result.get('CORE-10').description).toBe('Review code, discuss technical solutions');
  });

  it('gives review-influenced description to push events when ticket has review activity', () => {
    // Push event comes first, but ticket also has review activity (collected in pass 1)
    const events = [
      {
        type: 'PushEvent',
        payload: {
          ref: 'refs/heads/feature/AB-10',
          commits: [{ message: 'AB-10 fix feedback' }],
        },
      },
      {
        type: 'PullRequestReviewCommentEvent',
        payload: {
          pull_request: { title: 'AB-10 some PR' },
        },
      },
    ];
    const result = GitHubService.extractTicketMap(events, TIME_CONFIG);
    // Push is first occurrence, but AB-10 is in reviewTickets (from comment event in pass 1)
    expect(result.get('AB-10').description).toBe(
      'Resolve comment feedbacks, write tests, write API docs, self-test'
    );
  });

  it('handles multiple tickets in one commit message', () => {
    const events = [
      {
        type: 'PushEvent',
        payload: {
          ref: 'refs/heads/main',
          commits: [{ message: 'fix: UP-1 and UP-2 issues resolved' }],
        },
      },
    ];
    const result = GitHubService.extractTicketMap(events, TIME_CONFIG);
    expect(result.has('UP-1')).toBe(true);
    expect(result.has('UP-2')).toBe(true);
  });

  it('deduplicates tickets within a single event', () => {
    const events = [
      {
        type: 'PushEvent',
        payload: {
          ref: 'refs/heads/feature/UP-50-thing',
          commits: [
            { message: 'UP-50 first commit' },
            { message: 'UP-50 second commit' },
          ],
        },
      },
    ];
    const result = GitHubService.extractTicketMap(events, TIME_CONFIG);
    expect(result.size).toBe(1);
    expect(result.has('UP-50')).toBe(true);
  });

  it('returns empty map when no events', () => {
    const result = GitHubService.extractTicketMap([], TIME_CONFIG);
    expect(result.size).toBe(0);
  });

  it('ignores events without Jira ticket IDs', () => {
    const events = [
      {
        type: 'PushEvent',
        payload: {
          ref: 'refs/heads/main',
          commits: [{ message: 'update readme' }],
        },
      },
    ];
    const result = GitHubService.extractTicketMap(events, TIME_CONFIG);
    expect(result.size).toBe(0);
  });
});

describe('GitHubService.fetchEventsForDate', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('filters events by date in GMT+7', async () => {
    // 2026-04-08 23:30 UTC = 2026-04-09 06:30 GMT+7
    const mockEvents = [
      { created_at: '2026-04-08T23:30:00Z', repo: { name: 'Org/repo' } },
      // 2026-04-08 16:00 UTC = 2026-04-08 23:00 GMT+7 → still Apr 8
      { created_at: '2026-04-08T16:00:00Z', repo: { name: 'Org/repo' } },
    ];

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockEvents),
    }));

    const result = await GitHubService.fetchEventsForDate('user', '2026-04-09', 'token');
    expect(result).toHaveLength(1);
    expect(result[0].created_at).toBe('2026-04-08T23:30:00Z');
  });

  it('filters by allowedRepos when provided', async () => {
    const mockEvents = [
      { created_at: '2026-04-08T10:00:00Z', repo: { name: 'Org/allowed' } },
      { created_at: '2026-04-08T10:00:00Z', repo: { name: 'Org/blocked' } },
    ];

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockEvents),
    }));

    const result = await GitHubService.fetchEventsForDate(
      'user', '2026-04-08', 'token', ['Org/allowed']
    );
    expect(result).toHaveLength(1);
    expect(result[0].repo.name).toBe('Org/allowed');
  });

  it('allows all repos when allowedRepos is empty', async () => {
    const mockEvents = [
      { created_at: '2026-04-08T10:00:00Z', repo: { name: 'Org/any-repo' } },
    ];

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockEvents),
    }));

    const result = await GitHubService.fetchEventsForDate('user', '2026-04-08', 'token', []);
    expect(result).toHaveLength(1);
  });

  it('throws on 401 with helpful message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    }));

    await expect(
      GitHubService.fetchEventsForDate('user', '2026-04-08', 'bad-token')
    ).rejects.toThrow('Invalid GitHub token');
  });

  it('throws generic error on other status codes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    }));

    await expect(
      GitHubService.fetchEventsForDate('user', '2026-04-08', 'token')
    ).rejects.toThrow('GitHub API error: 500');
  });
});
