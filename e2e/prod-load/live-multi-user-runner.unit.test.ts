import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseExamRegisterUrl } from './exam-url';
import { loadUsersFromFile } from './user-source';

describe('exam-url', () => {
  it('parses origin and scheduleId from register url', () => {
    const parsed = parseExamRegisterUrl('https://example.com/student/abc-123/register');
    expect(parsed.origin).toBe('https://example.com');
    expect(parsed.scheduleId).toBe('abc-123');
  });

  it('throws for non-register path', () => {
    expect(() => parseExamRegisterUrl('https://example.com/student/abc-123')).toThrow();
  });
});

describe('user-source', () => {
  it('loads csv users and enforces required count', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-runner-'));
    const file = path.join(dir, 'users.csv');
    fs.writeFileSync(file, 'userId,email,password\nuser-1,u1@test.local,p1\nuser-2,u2@test.local,p2\n');

    const users = loadUsersFromFile(file, 2);
    expect(users).toHaveLength(2);
  });

  it('rejects duplicate email', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-runner-'));
    const file = path.join(dir, 'users.json');
    fs.writeFileSync(file, JSON.stringify([
      { userId: 'u1', email: 'dup@test.local', password: 'p1' },
      { userId: 'u2', email: 'dup@test.local', password: 'p2' },
    ]));

    expect(() => loadUsersFromFile(file, 2)).toThrow(/Duplicate email/);
  });

  it('rejects duplicate email case-insensitively', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-runner-'));
    const file = path.join(dir, 'users.json');
    fs.writeFileSync(file, JSON.stringify([
      { userId: 'u1', email: 'Dup@Test.Local', password: 'p1' },
      { userId: 'u2', email: 'dup@test.local', password: 'p2' },
    ]));

    expect(() => loadUsersFromFile(file, 2)).toThrow(/Duplicate email/);
  });
});
