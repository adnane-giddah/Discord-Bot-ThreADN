import { REPORT_INLINE_ITEM_LIMIT } from "../config/constants";

/**
 * Renders a list of lines either as an inline bullet string (short lists) or
 * signals that it should be attached as a file instead, to stay safely under
 * Discord's embed/message character limits.
 */
export function renderListOrAttachment(
  lines: string[],
  opts: { inlineLimit?: number; maxInlineChars?: number } = {},
): { mode: "inline"; text: string } | { mode: "attachment"; content: string } {
  const inlineLimit = opts.inlineLimit ?? REPORT_INLINE_ITEM_LIMIT;
  const maxInlineChars = opts.maxInlineChars ?? 900;

  if (lines.length === 0) {
    return { mode: "inline", text: "*(none)*" };
  }

  const joined = lines.join("\n");
  if (lines.length <= inlineLimit && joined.length <= maxInlineChars) {
    return { mode: "inline", text: joined };
  }

  return { mode: "attachment", content: lines.join("\n") + "\n" };
}

/** Splits text into chunks no longer than maxLength, breaking on line boundaries where possible. */
export function chunkText(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    if ((current + "\n" + line).length > maxLength) {
      if (current) chunks.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
