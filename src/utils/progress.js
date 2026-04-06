/**
 * Scale a raw progress value into a capped range.
 * If rawMax exceeds cap, all values are scaled proportionally.
 *
 * Example (cap=90): raw=100, rawMax=150 → scaled = 100 * (90/150) = 60%
 * Example (cap=90): raw=150, rawMax=150 → scaled = 150 * (90/150) = 90%
 *
 * @param {number} raw - The raw progress value to scale
 * @param {number} rawMax - The highest raw value in the set (used to compute scale ratio)
 * @param {string} status - Jira status name
 * @returns {number} Scaled and rounded progress percentage
 */
const DONE_STATUSES = ['QA READY', 'QA Success'];

function scaleWithCap(raw, rawMax, cap) {
  if (rawMax <= cap) return Math.round(Math.max(0, raw));
  const ratio = cap / rawMax;
  return Math.round(Math.max(0, raw * ratio));
}

/**
 * Calculate progress change for an issue based on worklog time.
 *
 * For done statuses (QA READY, QA Success): current = 100%, prev scaled with 90% cap.
 * For other statuses: both prev and current scaled with 90% cap.
 *
 * @param {number} totalSpentSeconds - Total time spent on the issue (seconds)
 * @param {number} secondsOnTarget - Time logged on the target date (seconds)
 * @param {number} storyPoints - Story points assigned to the issue
 * @param {number} hoursPerPoint - Hours per story point (default: 4)
 * @param {string} status - Jira status name (e.g. "In Progress", "QA READY")
 * @returns {string} Progress string like "25% → 50%" or "N/A"
 */
export function calculateProgress(totalSpentSeconds, secondsOnTarget, storyPoints, hoursPerPoint = 4, status = '') {
  const sp = storyPoints || 0;
  const goal = sp * hoursPerPoint;
  if (goal === 0) return 'N/A';

  const totalSpent = totalSpentSeconds / 3600;
  const rawCurrent = (totalSpent / goal) * 100;
  const rawPrev = ((totalSpent - (secondsOnTarget / 3600)) / goal) * 100;
  const isDone = DONE_STATUSES.includes(status);

  if (isDone) {
    // For done statuses: current is always 100%, prev scaled independently with 90% cap
    const prev = scaleWithCap(rawPrev, rawPrev, 90);
    return `${prev}% ➔ 100%`;
  }

  // For other statuses: both scaled with same ratio using 90% cap
  const rawMax = Math.max(rawCurrent, rawPrev);
  const prev = scaleWithCap(rawPrev, rawMax, 90);
  const current = scaleWithCap(rawCurrent, rawMax, 90);

  return `${prev}% ➔ ${current}%`;
}

/**
 * Calculate current progress percentage for a single issue.
 *
 * @param {number} totalSpentSeconds - Total time spent (seconds)
 * @param {number} storyPoints - Story points
 * @param {number} hoursPerPoint - Hours per story point
 * @param {string} status - Jira status name
 * @returns {number} Scaled progress percentage
 */
export function currentProgress(totalSpentSeconds, storyPoints, hoursPerPoint = 4, status = '') {
  if (DONE_STATUSES.includes(status)) return 100;
  const sp = storyPoints || 0;
  const goal = sp * hoursPerPoint;
  if (goal === 0) return 0;

  const raw = (totalSpentSeconds / 3600 / goal) * 100;
  return scaleWithCap(raw, raw, 90);
}
