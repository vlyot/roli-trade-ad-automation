// markdown.ts
// Small, dependency-free markdown -> HTML converter used by in-app How-to dialogs.
// Supports headings (#..), images ![alt](url), unordered lists (- or *), code fences, bold/italic, and paragraphs.
// Kept intentionally small to avoid adding a markdown dependency for this simple guide rendering.
export function markdownToHtml(md: string): string {
  if (!md) return '';
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = md.split(/\r?\n/);
  let out = '';
  let inList = false;
  let inCode = false;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    // code fence
    if (line.trim().startsWith('```')) {
      inCode = !inCode;
      out += inCode ? '<pre><code>' : '</code></pre>';
      continue;
    }
    if (inCode) {
      out += esc(line) + '\n';
      continue;
    }
    // headings
    const h = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      if (inList) { out += '</ul>'; inList = false; }
      out += `<h${level}>${esc(h[2])}</h${level}>`;
      continue;
    }
    // image
    const img = line.match(/!\[([^\]]*)\]\(([^)]+)\)/);
    if (img) {
      if (inList) { out += '</ul>'; inList = false; }
      out += `<p><img src="${esc(img[2])}" alt="${esc(img[1])}" style="max-width:100%"/></p>`;
      continue;
    }
    // unordered list
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ul) {
      if (!inList) { out += '<ul>'; inList = true; }
      out += `<li>${esc(ul[1])}</li>`;
      continue;
    }
    // horizontal rule
    if (/^\s*-{3,}\s*$/.test(line)) {
      if (inList) { out += '</ul>'; inList = false; }
      out += '<hr/>';
      continue;
    }
    // paragraph
    if (line.trim() === '') {
      if (inList) { out += '</ul>'; inList = false; }
      continue;
    }
    // inline bold/italic simple replacements
    let text = esc(line).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>');
    out += `<p>${text}</p>`;
  }
  if (inList) out += '</ul>';
  return out;
}
