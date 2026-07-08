export const normalizeMarkdownResponse = (content: string): string => {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '  ')
    .replace(/^[ \t]*\\([*+-]|\d+\.)\s+/gm, '$1 ')
    .replace(/\\([*_`~])/g, '$1')
    .replace(/\u00A0/g, ' ');
};
