import { describe, it, expect } from 'vitest';
import { buildInstruction } from '../storage.js';

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
    expect(result).toContain('professional technical terminology');
  });

  it('uses default hints when no platform provided', () => {
    const result = buildInstruction('some format');
    expect(result).toContain('professional technical terminology');
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
