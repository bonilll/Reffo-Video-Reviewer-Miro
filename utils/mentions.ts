import { MentionOption } from '../types';

export type MentionSegment =
  | { kind: 'text'; value: string }
  | { kind: 'mention'; value: string };

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
