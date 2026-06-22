/**
 * Unit tests for the practice/interview judge. The Docker execution layer
 * is mocked so these run fast and deterministically.
 */
import { jest } from '@jest/globals';

let mockRun = jest.fn();
jest.unstable_mockModule('../services/executionService.js', () => ({
  runCode: (...args) => mockRun(...args),
}));

const { judge, verdictFor, normalizeOutput, runSamples } = await import('../utils/judge.js');

const ok      = (stdout) => ({ status: 'success', exitCode: 0, stdout, stderr: '', executionTimeMs: 5 });
const tle     = () => ({ status: 'timeout', exitCode: 124, stdout: '', stderr: '', executionTimeMs: 10000 });
const mle     = () => ({ status: 'oom', exitCode: 137, stdout: '', stderr: 'Killed', executionTimeMs: 5 });
const ce      = () => ({ status: 'compile_error', exitCode: 1, stdout: '', stderr: 'error:', executionTimeMs: 5 });
const re      = () => ({ status: 'runtime_error', exitCode: 1, stdout: '', stderr: 'boom', executionTimeMs: 5 });

beforeEach(() => { mockRun = jest.fn(); });

describe('normalizeOutput', () => {
  it('strips trailing spaces per line and trailing newlines', () => {
    expect(normalizeOutput('a   \nb\n\n')).toBe('a\nb');
  });
  it('treats CRLF like LF', () => {
    expect(normalizeOutput('x\r\ny\r\n')).toBe('x\ny');
  });
  it('handles null/undefined', () => {
    expect(normalizeOutput(undefined)).toBe('');
  });
});

describe('verdictFor', () => {
  it('Accepted on exact match (newline tolerant)', () => {
    expect(verdictFor(ok('5\n'), '5')).toMatchObject({ passed: true, status: 'success' });
  });
  it('Wrong Answer on mismatch', () => {
    expect(verdictFor(ok('6'), '5')).toMatchObject({ passed: false, status: 'wrong_answer' });
  });
  it('Time Limit Exceeded', () => {
    expect(verdictFor(tle(), '5')).toMatchObject({ passed: false, status: 'timeout' });
  });
  it('Memory Limit Exceeded', () => {
    expect(verdictFor(mle(), '5')).toMatchObject({ passed: false, status: 'oom' });
  });
  it('Compilation Error', () => {
    expect(verdictFor(ce(), '5')).toMatchObject({ passed: false, status: 'compile_error' });
  });
  it('Runtime Error', () => {
    expect(verdictFor(re(), '5')).toMatchObject({ passed: false, status: 'runtime_error' });
  });
  it('non-zero exit is a Runtime Error even if status looks ok', () => {
    expect(verdictFor({ status: 'success', exitCode: 1, stdout: '5' }, '5')).toMatchObject({ passed: false, status: 'runtime_error' });
  });
});

describe('judge', () => {
  it('runs once with no tests and reports success', async () => {
    mockRun = jest.fn(async () => ok('anything'));
    const r = await judge({ language: 'python', code: 'print(1)', tests: [] });
    expect(r.total).toBe(0);
    expect(r.accepted).toBe(true);
    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  it('accepts when all hidden tests pass', async () => {
    mockRun = jest.fn(async ({ stdin }) => ok(stdin === '1' ? '10' : '20'));
    const tests = [
      { input: '1', expectedOutput: '10' },
      { input: '2', expectedOutput: '20' },
    ];
    const r = await judge({ language: 'python', code: 'x', tests });
    expect(r.accepted).toBe(true);
    expect(r.passed).toBe(2);
    expect(r.total).toBe(2);
    expect(r.firstFailureIndex).toBe(-1);
    expect(mockRun).toHaveBeenCalledTimes(2);
  });

  it('stops at the first failing test and reports the index', async () => {
    let call = 0;
    mockRun = jest.fn(async () => (++call === 1 ? ok('10') : ok('WRONG')));
    const tests = [
      { input: '1', expectedOutput: '10' },
      { input: '2', expectedOutput: '20' },
      { input: '3', expectedOutput: '30' },
    ];
    const r = await judge({ language: 'python', code: 'x', tests });
    expect(r.accepted).toBe(false);
    expect(r.passed).toBe(1);
    expect(r.firstFailureIndex).toBe(2);
    expect(r.status).toBe('wrong_answer');
    expect(mockRun).toHaveBeenCalledTimes(2); // stops after the failure
  });

  it('a compile error fails immediately', async () => {
    mockRun = jest.fn(async () => ce());
    const tests = [{ input: '1', expectedOutput: '10' }, { input: '2', expectedOutput: '20' }];
    const r = await judge({ language: 'cpp', code: 'bad', tests });
    expect(r.accepted).toBe(false);
    expect(r.firstFailureIndex).toBe(1);
    expect(r.status).toBe('compile_error');
    expect(mockRun).toHaveBeenCalledTimes(1);
  });
});

describe('runSamples', () => {
  it('returns per-sample pass/fail with expected and got', async () => {
    mockRun = jest.fn(async ({ stdin }) => ok(stdin === '2 3' ? '5' : '999'));
    const samples = [
      { input: '2 3', output: '5' },
      { input: '4 4', output: '8' },
    ];
    const out = await runSamples({ language: 'python', code: 'x', samples });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ passed: true, index: 1 });
    expect(out[1]).toMatchObject({ passed: false, expected: '8', got: '999' });
  });
});
