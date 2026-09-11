import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

function toCSV(rows, headers) {
  const escape = (v) => {
    const s = v == null ? '' : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const headerLine = headers.map((h) => escape(h.label)).join(',');
  const body = rows.map((r) => headers.map((h) => escape(r[h.key])).join(',')).join('\n');
  return `${headerLine}\n${body}`;
}

async function toExcel(rows, headers, title) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(title || 'Reporte');
  ws.columns = headers.map((h) => ({ header: h.label, key: h.key, width: h.width || 18 }));
  ws.getRow(1).font = { bold: true };
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function toPdf(rows, headers, title) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, layout: 'landscape' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text(title || 'Reporte', { align: 'center' });
    doc.moveDown(0.5);

    const colCount = headers.length;
    const pageWidth = doc.page.width - 80;
    const colWidth = pageWidth / colCount;

    // Encabezado
    doc.fontSize(9).font('Helvetica-Bold');
    headers.forEach((h, i) => doc.text(h.label, 40 + i * colWidth, doc.y, { width: colWidth }));
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(8);

    for (const row of rows) {
      const y = doc.y;
      headers.forEach((h, i) => {
        const val = row[h.key] == null ? '' : String(row[h.key]);
        doc.text(val, 40 + i * colWidth, y, { width: colWidth, height: 12 });
      });
      doc.moveDown(0.2);
      if (doc.y > doc.page.height - 60) doc.addPage();
    }
    doc.end();
  });
}

export async function exportData({ format, rows, headers, title, filename }) {
  let buffer;
  let contentType;
  let ext;

  if (format === 'csv') {
    buffer = Buffer.from(toCSV(rows, headers), 'utf8');
    contentType = 'text/csv';
    ext = 'csv';
  } else if (format === 'xlsx' || format === 'excel') {
    buffer = await toExcel(rows, headers, title);
    contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    ext = 'xlsx';
  } else if (format === 'pdf') {
    buffer = await toPdf(rows, headers, title);
    contentType = 'application/pdf';
    ext = 'pdf';
  } else {
    buffer = Buffer.from(toCSV(rows, headers), 'utf8');
    contentType = 'text/csv';
    ext = 'csv';
  }

  return {
    buffer,
    contentType,
    filename: `${filename}.${ext}`,
  };
}
