import { describe, it, expect } from 'vitest';
import {
  buildCommand, parseTaggedRecords, classifyLoginError,
} from '../../electron/services/perforce.js';

describe('buildCommand', () => {
  it('defaults to a tagged command with no user or client', () => {
    expect(buildCommand('info')).toBe('p4 -Ztag info');
  });

  it('includes user and client when given, in p4 flag order', () => {
    expect(buildCommand('opened', { user: 'jlin', client: 'art-ws' }))
      .toBe('p4 -u "jlin" -c "art-ws" -Ztag opened');
  });

  it('quotes user and client so names with spaces survive', () => {
    expect(buildCommand('opened', { client: 'art ws 01' }))
      .toBe('p4 -c "art ws 01" -Ztag opened');
  });

  it('omits -Ztag when tagged is false', () => {
    // Used for commands whose plain output is parsed directly, e.g. diffs.
    expect(buildCommand('diff //depot/a.txt', { tagged: false }))
      .toBe('p4 diff //depot/a.txt');
  });

  it('ignores empty user and client rather than emitting empty flags', () => {
    expect(buildCommand('info', { user: '', client: '' })).toBe('p4 -Ztag info');
  });
});

// `-Ztag` exists precisely so values containing spaces stay unambiguous. Plain p4
// output has no such guarantee and breaks on real-world filenames, so these tests
// lean hard on the awkward cases.
describe('parseTaggedRecords', () => {
  it('parses a single record into one object', () => {
    const out = [
      '... depotFile //depot/art/barrel.obj',
      '... action edit',
      '... rev 3',
    ].join('\n');
    expect(parseTaggedRecords(out)).toEqual([
      { depotFile: '//depot/art/barrel.obj', action: 'edit', rev: '3' },
    ]);
  });

  it('splits records on blank lines', () => {
    const out = [
      '... depotFile //depot/a.png', '... action add', '',
      '... depotFile //depot/b.png', '... action edit', '',
    ].join('\n');
    const records = parseTaggedRecords(out);
    expect(records).toHaveLength(2);
    expect(records[0].depotFile).toBe('//depot/a.png');
    expect(records[1].action).toBe('edit');
  });

  it('pushes the final record when the output has no trailing blank line', () => {
    const out = '... depotFile //depot/a.png\n... action add';
    expect(parseTaggedRecords(out)).toHaveLength(1);
  });

  it('keeps spaces inside a value', () => {
    const out = '... clientFile C:\work\art\my big prop.fbx\n... action edit';
    expect(parseTaggedRecords(out)[0].clientFile)
      .toBe('C:\work\art\my big prop.fbx');
  });

  it('handles CRLF output from the Windows p4 client', () => {
    const out = '... depotFile //depot/a.png\r\n... action add\r\n\r\n... depotFile //depot/b.png\r\n';
    const records = parseTaggedRecords(out);
    expect(records).toHaveLength(2);
    // A stray \r must not end up glued to the value.
    expect(records[0].action).toBe('add');
    expect(records[1].depotFile).toBe('//depot/b.png');
  });

  it('reads a field with an empty value', () => {
    const out = '... depotFile //depot/a.png\n... desc ';
    expect(parseTaggedRecords(out)[0]).toEqual({ depotFile: '//depot/a.png', desc: '' });
  });

  it('ignores lines that are not tagged fields', () => {
    // p4 prefixes warnings and blank informational lines that are not records.
    const out = [
      'Client art-ws unknown.',
      '... depotFile //depot/a.png',
      'some trailing noise',
      '... action add',
    ].join('\n');
    expect(parseTaggedRecords(out)).toEqual([
      { depotFile: '//depot/a.png', action: 'add' },
    ]);
  });

  it('returns an empty array for empty or whitespace-only output', () => {
    expect(parseTaggedRecords('')).toEqual([]);
    expect(parseTaggedRecords('\n\n  \n')).toEqual([]);
  });

  it('collapses repeated blank lines instead of emitting empty records', () => {
    const out = '... a 1\n\n\n\n... a 2\n';
    expect(parseTaggedRecords(out)).toEqual([{ a: '1' }, { a: '2' }]);
  });

  it('lets a later field of the same name win within one record', () => {
    expect(parseTaggedRecords('... rev 1\n... rev 2')).toEqual([{ rev: '2' }]);
  });
});

// Perforce returns the identical "Password invalid." for a wrong password AND a
// nonexistent user, deliberately, so that credentials is the most precise blame
// this can ever assign. Connection failures are genuinely distinguishable.
describe('classifyLoginError', () => {
  it.each([
    ['Connect to server failed; check $P4PORT.'],
    ['TCP connect to perforce.example.com:1666 failed.'],
    ['Unknown host perforce.example.com'],
    ["Couldn't resolve perforce.example.com"],
  ])('blames the server for %j', (msg) => {
    expect(classifyLoginError(msg)).toBe('server');
  });

  it.each([
    ['Password invalid.'],
    ["User bob doesn't exist. Password invalid."],
    ['Not logged in.'],
    ['authentication failed'],
  ])('blames credentials for %j', (msg) => {
    expect(classifyLoginError(msg)).toBe('credentials');
  });

  it('falls back to unknown for unrecognized errors', () => {
    expect(classifyLoginError('Something else went wrong entirely')).toBe('unknown');
    expect(classifyLoginError('')).toBe('unknown');
  });

  it('is case-insensitive', () => {
    expect(classifyLoginError('PASSWORD INVALID.')).toBe('credentials');
    expect(classifyLoginError('CONNECT TO SERVER FAILED')).toBe('server');
  });
});
