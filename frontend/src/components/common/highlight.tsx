import { Fragment } from "react";

/** Render text nodes only; search terms and snippets can never inject HTML. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const term = query.trim();
  if (!term) return <>{text}</>;
  const lower = text.toLocaleLowerCase();
  const needle = term.toLocaleLowerCase();
  const parts = [];
  let start = 0;
  let index = lower.indexOf(needle);
  while (index !== -1) {
    parts.push(<Fragment key={index}>{text.slice(start, index)}<mark className="rounded bg-warning/20 font-bold text-inherit">{text.slice(index, index + term.length)}</mark></Fragment>);
    start = index + term.length;
    index = lower.indexOf(needle, start);
  }
  return <>{parts}{text.slice(start)}</>;
}
