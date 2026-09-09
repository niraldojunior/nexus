export const replaceQuestionBinds = (sql: string, replacement: () => string): string => {
  let result = '';
  let inSingle = false;
  let inDouble = false;
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index]!;
    if (char === "'" && !inDouble) inSingle = !inSingle;
    if (char === '"' && !inSingle) inDouble = !inDouble;
    result += char === '?' && !inSingle && !inDouble ? replacement() : char;
  }
  return result;
};
