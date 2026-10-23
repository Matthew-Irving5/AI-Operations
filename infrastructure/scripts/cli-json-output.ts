export function parseJsonObjectsFromCliOutput(output: string): unknown[] {
  const objects: unknown[] = [];
  let cursor = 0;
  while (cursor < output.length) {
    const start = output.indexOf('{', cursor);
    if (start < 0) break;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;
    for (let index = start; index < output.length; index += 1) {
      const character = output[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === '{') depth += 1;
      else if (character === '}') {
        depth -= 1;
        if (depth === 0) {
          end = index;
          break;
        }
      }
    }
    if (end < start) {
      cursor = start + 1;
      continue;
    }
    try {
      const candidate: unknown = JSON.parse(output.slice(start, end + 1));
      if (candidate !== null && typeof candidate === 'object' && !Array.isArray(candidate)) {
        objects.push(candidate);
        cursor = end + 1;
      } else {
        cursor = start + 1;
      }
    } catch {
      cursor = start + 1;
    }
  }
  return objects;
}
