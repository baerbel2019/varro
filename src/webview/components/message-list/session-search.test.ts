import { describe, expect, it } from 'vitest';
import {
  assistantMessage,
  filePart,
  reasoningPart,
  textPart,
  toolPart,
  userMessage,
} from '../MessageList.test-utils';
import { getSessionSearchDocuments, searchSessionDocuments } from './session-search';

describe('session search text', () => {
  it('includes attachment-only prompts without including automatic notices', () => {
    const documents = getSessionSearchDocuments(
      [
        { info: userMessage('image-prompt'), parts: [filePart('image', 'screenshot.png')] },
        {
          info: userMessage('automatic'),
          parts: [textPart('notice', 'Generated context', { synthetic: true })],
        },
      ],
      'session-1'
    );
    expect(documents.map(({ id, text }) => ({ id, text }))).toEqual([
      { id: 'image-prompt', text: 'screenshot.png' },
    ]);
  });

  it('searches actual prompts and response text, not tools, reasoning, generated context, or child sessions', () => {
    const documents = getSessionSearchDocuments(
      [
        {
          info: userMessage('prompt'),
          parts: [
            textPart('prompt-text', 'Find\n  this prompt'),
            textPart('context', 'hidden generated context', { synthetic: true }),
          ],
        },
        {
          info: assistantMessage('response'),
          parts: [
            textPart('response-text', 'Here is the response'),
            reasoningPart('thought', 'hidden reasoning'),
            toolPart('tool'),
          ],
        },
        {
          info: { ...assistantMessage('child'), sessionID: 'child' },
          parts: [textPart('child-text', 'hidden child text')],
        },
        {
          info: assistantMessage('directory'),
          parts: [textPart('directory-text', '[Working directory: /hidden]')],
        },
      ],
      'session-1'
    );
    expect(documents.map(({ id, text }) => ({ id, text }))).toEqual([
      { id: 'prompt', text: 'Find this prompt' },
      { id: 'response', text: 'Here is the response' },
    ]);
    expect(searchSessionDocuments(documents, 'THIS\nPROMPT')[0]?.id).toBe('prompt');
    expect(searchSessionDocuments(documents, 'hidden')).toEqual([]);
  });

  it('matches punctuation literally and preserves original case in the snippet', () => {
    const documents = [
      {
        id: 'answer',
        role: 'assistant' as const,
        created: 1,
        text: 'Use Array.map(x) with [a-z]+ and $HOME.',
      },
    ];
    expect(searchSessionDocuments(documents, '[A-Z]+')[0]).toMatchObject({
      before: 'Use Array.map(x) with ',
      match: '[a-z]+',
      after: ' and $HOME.',
    });
    expect(searchSessionDocuments(documents, 'Array.map(x)')).toHaveLength(1);
    expect(searchSessionDocuments(documents, '$HOME')).toHaveLength(1);
    expect(searchSessionDocuments(documents, '  ')).toEqual([]);
  });

  it('bounds snippets around the first occurrence and returns one result per message', () => {
    const documents = [
      {
        id: 'long',
        role: 'user' as const,
        created: 1,
        text: `${'a'.repeat(200)} MATCH ${'b'.repeat(200)} MATCH`,
      },
    ];
    const results = searchSessionDocuments(documents, 'match');
    expect(results).toHaveLength(1);
    expect(results[0]?.before).toHaveLength(66);
    expect(results[0]?.after).toHaveLength(101);
    expect(results[0]?.before.startsWith('…')).toBe(true);
    expect(results[0]?.after.endsWith('…')).toBe(true);
  });
});
