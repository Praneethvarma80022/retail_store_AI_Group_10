function escapeCsvValue(value) {
  const normalized = value ?? "";
  const text = String(normalized).replace(/"/g, '""');
  return `"${text}"`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function downloadCsv(filename, headers, rows) {
  const csvContent = [
    headers.map(escapeCsvValue).join(","),
    ...rows.map((row) => row.map(escapeCsvValue).join(",")),
  ].join("\n");

  const blob = new Blob([csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadExcel(filename, headers, rows, sheetName = "Sheet1") {
  const tableHeader = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  const tableRows = rows
    .map(
      (row) =>
        `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`
    )
    .join("");

  const workbook = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="ProgId" content="Excel.Sheet" />
    <meta name="Generator" content="Retail AI" />
    <title>${escapeHtml(sheetName)}</title>
  </head>
  <body>
    <table>
      <thead>
        <tr>${tableHeader}</tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
  </body>
</html>`;

  const blob = new Blob([workbook], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function parseCsv(text) {
  const rows = [];
  const normalized = String(text || "").replace(/^\uFEFF/, "");
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    const nextCharacter = normalized[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      row.push(current.trim());
      current = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      row.push(current.trim());
      current = "";

      if (row.some((value) => value !== "")) {
        rows.push(row);
      }

      row = [];
      continue;
    }

    current += character;
  }

  if (current || row.length) {
    row.push(current.trim());
    if (row.some((value) => value !== "")) {
      rows.push(row);
    }
  }

  if (!rows.length) {
    return [];
  }

  const [headers, ...values] = rows;
  const normalizedHeaders = headers.map((header) => header.trim());

  return values
    .filter((valueRow) => valueRow.some((value) => String(value).trim()))
    .map((valueRow) =>
      normalizedHeaders.reduce((record, header, headerIndex) => {
        record[header] = valueRow[headerIndex] ?? "";
        return record;
      }, {})
    );
}
