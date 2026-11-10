export const fullText = book => book.paragraphs.join('\n');
export function buildContext(text, selection, analysis, allowSpoilers) {
  const start = Math.max(0, selection.start - 5000);
  const end = allowSpoilers ? Math.min(text.length, selection.end + 1500) : selection.end;
  return { excerpts: [{start, end, text: text.slice(start, end)}] };
}
export function selectionFromRange(range, content, book) {
  const locate = (node, offset) => {
    if (node === content) return book.paragraphs.slice(0, offset).reduce((total, part, index) => total + part.length + (index < book.paragraphs.length - 1 ? 1 : 0), 0);
    let element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    const paragraph = element?.closest('p');
    if (!paragraph || paragraph.parentElement !== content) return null;
    const index = Array.prototype.indexOf.call(content.children, paragraph);
    const before = book.paragraphs.slice(0, index).reduce((total, part) => total + part.length + 1, 0);
    const inner = document.createRange(); inner.selectNodeContents(paragraph); inner.setEnd(node, offset);
    return before + Math.min(book.paragraphs[index].length, inner.toString().length);
  };
  const start = locate(range.startContainer, range.startOffset), end = locate(range.endContainer, range.endOffset);
  if (start === null || end === null || end <= start) return null;
  return {start, end, text: fullText(book).slice(start, end)};
}
