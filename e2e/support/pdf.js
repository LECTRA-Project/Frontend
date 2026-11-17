/*
  A small text PDF for the browser tests, made on the fly (no course material in the repo):
  one page per entry, each line written in Helvetica, so the backend extracts the text and
  the viewer shows it.

    makePdf([["Decision trees", "They split the data by attributes."], ["Gini index", "…"]])
*/
const escape = (text) => text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

export function makePdf(pages) {
  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length; // object number
  };
  const catalog = add(null); // filled in below, once the pages are known
  const pagesRoot = add(null);
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const kids = pages.map((lines) => {
    const text = lines
      .map((line, index) => `BT /F1 ${index === 0 ? 24 : 14} Tf 72 ${720 - index * 32} Td (${escape(line)}) Tj ET`)
      .join("\n");
    const content = add(`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`);
    return add(`<< /Type /Page /Parent ${pagesRoot} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`);
  });
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesRoot} 0 R >>`;
  objects[pagesRoot - 1] = `<< /Type /Pages /Kids [${kids.map((kid) => `${kid} 0 R`).join(" ")}] /Count ${kids.length} >>`;

  let out = "%PDF-1.4\n";
  const offsets = objects.map((body, index) => {
    const offset = Buffer.byteLength(out);
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/* The lecture every test uses: 6 pages about decision trees. */
export const LECTURE_PAGES = [
  ["Decision trees", "A decision tree splits the data by one attribute at each node.", "Leaves hold the predicted class."],
  ["Hunt's algorithm", "Grow the tree by splitting impure nodes.", "Stop when a node holds only one class."],
  ["Gini index", "The Gini index measures how impure a node is.", "It is 0 when all records belong to one class."],
  ["Entropy", "Entropy is another measure of impurity.", "Information gain is the drop in entropy after a split."],
  ["Overfitting", "A tree that is too deep learns the noise in the data.", "Pruning removes branches that don't help."],
  ["Random forests", "Many trees, each on a sample of the data.", "Their votes give the prediction."],
];
