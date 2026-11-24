/** Mask literal examples and comments, preserving every offset and newline. */
export function maskTex(source: string, options: { comments?: boolean } = {}) {
  const chars = source.split("");
  const mask = (from: number, to: number) => {
    for (let j = from; j < to; j++)
      if (!/[\r\n]/.test(chars[j])) chars[j] = " ";
  };
  for (let i = 0; i < source.length;) {
    if (source[i] === "%") {
      const end = source.indexOf("\n", i);
      const to = end < 0 ? source.length : end;
      if (options.comments !== false) mask(i, to);
      i = to;
      continue;
    }
    if (source[i] === "\\") {
      const block = source
        .slice(i)
        .match(
          /^\\begin\s*\{(verbatim\*?|Verbatim|lstlisting|minted|comment)\}/,
        );
      if (block) {
        const end = source.indexOf(`\\end{${block[1]}}`, i + block[0].length);
        const to = end < 0 ? source.length : end + `\\end{${block[1]}}`.length;
        mask(i + block[0].length, end < 0 ? source.length : end);
        i = to;
        continue;
      }
      const verb = source.slice(i).match(/^\\verb\*?([^a-zA-Z\s])/);
      if (verb) {
        const end = source.indexOf(verb[1], i + verb[0].length);
        const newline = source.indexOf("\n", i);
        const to =
          end >= 0 && (newline < 0 || end < newline)
            ? end + 1
            : newline < 0
              ? source.length
              : newline;
        mask(i, to);
        i = to;
        continue;
      }
      // Control symbols such as \%, \\ and \{ consume the next character.
      if (source[i + 1] && !/[a-zA-Z]/.test(source[i + 1])) {
        i += 2;
        continue;
      }
    }
    i++;
  }
  return chars.join("");
}

export function environmentStack(source: string, position: number) {
  const stack: string[] = [];
  for (const token of maskTex(source)
    .slice(0, position)
    .matchAll(/\\(begin|end)\s*\{([^}]+)\}/g)) {
    if (token[1] === "begin") stack.push(token[2]);
    else if (stack.at(-1) === token[2]) stack.pop();
    else return null;
  }
  return stack;
}

export function sourceLineIndex(source: string) {
  const starts = [0];
  for (const match of source.matchAll(/\n/g)) starts.push(match.index + 1);
  return (position: number) => {
    let low = 0,
      high = starts.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (starts[middle] <= position) low = middle + 1;
      else high = middle;
    }
    return Math.max(1, low);
  };
}
