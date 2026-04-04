/**
 * Calculate progress change for an issue based on worklog time.
 *
 * @param {number} totalSpentSeconds - Total time spent on the issue (seconds)
 * @param {number} secondsOnTarget - Time logged on the target date (seconds)
 * @param {number} storyPoints - Story points assigned to the issue
 * @param {number} hoursPerPoint - Hours per story point (default: 4)
 * @returns {string} Progress string like "25% → 50%" or "N/A"
 */
export function calculateProgress(totalSpentSeconds, secondsOnTarget, storyPoints, hoursPerPoint = 4) {
  const sp = storyPoints || 0;
  const goal = sp * hoursPerPoint;
  if (goal === 0) return 'N/A';

  const totalSpent = totalSpentSeconds / 3600;
  const current = (totalSpent / goal) * 100;
  const prev = ((totalSpent - (secondsOnTarget / 3600)) / goal) * 100;

  return `${Math.round(prev)}% ➔ ${Math.round(current)}%`;
}
