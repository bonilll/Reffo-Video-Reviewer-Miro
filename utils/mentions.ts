import { MentionOption } from '../types';

export type MentionSegment =
  | { kind: 'text'; value: string }
  | { kind: 'mention'; value: string }
  | { kind: 'frame'; raw: string; frame: number };

const GENERIC_LABEL_REGEX = /[A-Za-z0-9_.-]/;
const BOUNDARY_REGEX = /[\s.,!?;:)\]\}]/;

type PreparedMention = { label: string; lower: string };

const prepareMentionOptions = (options?: MentionOption[]): PreparedMention[] => {
  if (!options || options.length === 0) return [];
  return options
    .map((option) => option.label?.trim())
    .filter((label): label is string => Boolean(label))
    .map((label) => ({ label, lower: label.toLowerCase() }))
    .sort((a, b) => b.label.length - a.label.length);
};

const matchMentionAt = (
  text: string,
  index: number,
  preparedOptions: PreparedMention[],
): { label: string; end: number } | null => {
  const remaining = text.slice(index + 1);
  if (!remaining) return null;

  if (preparedOptions.length) {
    const remainingLower = remaining.toLowerCase();
    for (const option of preparedOptions) {
      if (!remainingLower.startsWith(option.lower)) continue;
      const boundaryIndex = index + 1 + option.label.length;
      const boundaryChar = text[boundaryIndex];
      if (boundaryChar && !BOUNDARY_REGEX.test(boundaryChar)) {
        continue;
      }
      return { label: option.label, end: boundaryIndex };
    }
  }

  let cursor = index + 1;
  while (cursor < text.length && GENERIC_LABEL_REGEX.test(text[cursor])) {
    cursor += 1;
  }
  if (cursor === index + 1) return null;
  return { label: text.slice(index + 1, cursor), end: cursor };
};

const matchFrameAt = (text: string, index: number): { raw: string; frame: number; end: number } | null => {
  const next = text[index + 1];
  const next2 = text[index + 2];
  if (!next || !next2) return null;
  const normalized = next.toUpperCase();
  if (normalized !== 'F' || next2 !== '-') return null;

  let cursor = index + 3;
  while (cursor < text.length && /\d/.test(text[cursor])) {
    cursor += 1;
  }
  if (cursor === index + 3) return null;
  const frameValue = text.slice(index + 3, cursor);
  const frame = Number.parseInt(frameValue, 10);
  if (!Number.isFinite(frame)) return null;
  const boundaryChar = text[cursor];
  if (boundaryChar && !BOUNDARY_REGEX.test(boundaryChar)) {
    return null;
  }
  const canonical = `@F-${frameValue}`;
  return { raw: canonical, frame, end: cursor };
};

export const splitMentionSegments = (
  text: string,
  mentionOptions?: MentionOption[],
): MentionSegment[] => {
  if (!text) {
    return [{ kind: 'text', value: '' }];
  }

  const segments: MentionSegment[] = [];
  const prepared = prepareMentionOptions(mentionOptions);
  let buffer = '';

  const flushBuffer = () => {
    if (!buffer) return;
    segments.push({ kind: 'text', value: buffer });
    buffer = '';
  };

  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === '@') {
      const frameMatch = matchFrameAt(text, index);
      if (frameMatch) {
        flushBuffer();
        segments.push({ kind: 'frame', raw: frameMatch.raw, frame: frameMatch.frame });
        index = frameMatch.end;
        continue;
      }
      const match = matchMentionAt(text, index, prepared);
      if (match) {
        flushBuffer();
        segments.push({ kind: 'mention', value: match.label });
        index = match.end;
        continue;
      }
    }
    buffer += char;
    index += 1;
  }

  flushBuffer();

  if (segments.length === 0) {
    return [{ kind: 'text', value: text }];
  }

  return segments;
};
