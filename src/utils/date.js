export class DateHelper {
  /**
   * Calculate the target date for worklog fetching.
   * Monday → Friday, Sunday → Friday, else → Yesterday.
   * Uses local time formatting to avoid timezone bugs.
   */
  static getTargetDate(baseDate = new Date()) {
    const target = new Date(baseDate);
    const day = target.getDay();

    if (day === 1) target.setDate(target.getDate() - 3);      // Monday → Friday
    else if (day === 0) target.setDate(target.getDate() - 2);  // Sunday → Friday
    else target.setDate(target.getDate() - 1);                 // Others → Yesterday

    const yyyy = target.getFullYear();
    const mm = String(target.getMonth() + 1).padStart(2, '0');
    const dd = String(target.getDate()).padStart(2, '0');

    return `${yyyy}-${mm}-${dd}`;
  }

  /**
   * Format a Date object to YYYY-MM-DD using local time.
   */
  static formatDate(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
}
