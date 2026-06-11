import { describe, it, expect } from 'vitest';
import { buildInstruction, getAiUsage, DEFAULT_AI_USAGE } from '../storage.js';

describe('buildInstruction', () => {
  it('includes the provided format template', () => {
    const format = 'DAILY REPORT\n[task list]';
    const result = buildInstruction(format, 'Backend');
    expect(result).toContain(format);
  });

  it('includes Backend platform hints for Backend role', () => {
    const result = buildInstruction('some format', 'Backend');
    expect(result).toContain('Senior Backend Developer');
    expect(result).toContain('API design');
    expect(result).toContain('microservices');
  });

  it('includes QA platform hints for QA role', () => {
    const result = buildInstruction('some format', 'QA');
    expect(result).toContain('QA Engineer');
    expect(result).toContain('test cases');
    expect(result).toContain('regression');
  });

  it('includes Android platform hints', () => {
    const result = buildInstruction('some format', 'Android');
    expect(result).toContain('Android Developer');
    expect(result).toContain('Kotlin');
  });

  it('includes iOS platform hints', () => {
    const result = buildInstruction('some format', 'iOS');
    expect(result).toContain('iOS Developer');
    expect(result).toContain('SwiftUI');
  });

  it('includes Web platform hints', () => {
    const result = buildInstruction('some format', 'Web');
    expect(result).toContain('Web/Frontend Developer');
    expect(result).toContain('React');
  });

  it('includes BA platform hints', () => {
    const result = buildInstruction('some format', 'BA');
    expect(result).toContain('Business Analyst');
    expect(result).toContain('user stories');
  });

  it('uses default hints for unknown platform', () => {
    const result = buildInstruction('some format', 'DevOps');
    // DEFAULT_PLATFORM_HINT now mirrors the Backend hint as a sensible fallback.
    expect(result).toContain('Senior Backend Developer');
  });

  it('uses default hints when no platform provided', () => {
    const result = buildInstruction('some format');
    expect(result).toContain('Senior Backend Developer');
    expect(result).toContain('Senior Developer Assistant');
  });

  it('includes critical processing rules', () => {
    const result = buildInstruction('some format', 'Backend');
    // Must keep tasks in original category
    expect(result).toContain('do NOT move tasks between categories');
    // Must use progress as-is
    expect(result).toContain('do NOT recalculate or override it');
    // Velocity rule
    expect(result).toContain('1.5 Story Points per working day');
  });

  it('includes emoji symbols for sections', () => {
    const result = buildInstruction('some format');
    expect(result).toContain('🎉');
    expect(result).toContain('🚀');
    expect(result).toContain('📅');
  });
});

describe('getAiUsage', () => {
  it('returns the Bug-specific line for Backend + Bug', () => {
    expect(getAiUsage('Backend', 'Bug')).toBe(
      'Scan current code to understand business logic, investigate issue, write code to fix issue and fix data if necessary'
    );
  });

  it('returns the Task-specific line for Backend + Task', () => {
    expect(getAiUsage('Backend', 'Task')).toBe(
      'Write solution design & implementation plan, generate code, generate tests'
    );
  });

  it('falls back to the platform default when issue type is unknown', () => {
    expect(getAiUsage('Backend', 'Story')).toBe(DEFAULT_AI_USAGE);
    expect(getAiUsage('Backend')).toBe(DEFAULT_AI_USAGE);
  });

  it('returns the platform default for platforms without per-issue-type variants', () => {
    expect(getAiUsage('QA', 'Bug')).toBe(
      'Generate test cases for new API endpoints, write automation scripts for regression suite'
    );
  });

  it('falls back to DEFAULT_AI_USAGE for an unknown platform', () => {
    expect(getAiUsage('Marketing', 'Bug')).toBe(DEFAULT_AI_USAGE);
  });
});
