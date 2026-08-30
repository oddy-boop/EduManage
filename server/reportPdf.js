import PDFDocument from 'pdfkit';

/**
 * Renders a report card as a real PDF.
 *
 * Deliberately driven by the report DATA plus the school's configured grading
 * scale, not by the React layout — so the two can never disagree on a grade or a
 * total, which is the failure that actually matters. The visual styling is its
 * own thing; the numbers have one source.
 *
 * Chosen over headless Chrome on purpose: this ships in ~1 MB and runs anywhere,
 * where puppeteer drags in a ~300 MB Chromium a school server has to host.
 */

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';
const BRAND = '#195de6';

const TONE_HEX = { mint: '#0b7f57', blue: '#195de6', butter: '#a16207', blush: '#be1e51' };

const money = (n) => Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

export function renderReportPdf({ report, student, bands, caMax, examMax, school = {} }) {
  const doc = new PDFDocument({ size: 'A4', margin: 46 });
  const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const L = doc.page.margins.left;

  const gradeFor = (total) => {
    const n = Number(total);
    if (!Number.isFinite(n)) return null;
    return bands.find((b) => n >= b.minScore && n <= b.maxScore) || null;
  };

  /* ---- masthead ---- */
  doc.roundedRect(L, doc.y, 40, 40, 10).fill(BRAND);
  doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold')
    .text((school.school_name || 'S').trim().charAt(0).toUpperCase() || 'S', L + 14, doc.y - 32);

  const schoolName = (school.school_name || '').trim() || 'Your school';
  // Only real, configured details reach the page. An unset field prints nothing
  // rather than a bracketed placeholder — this document goes home to parents.
  const contact = [school.school_address, school.school_phone, school.school_email]
    .map((v) => (v || '').trim())
    .filter(Boolean)
    .join('  ·  ');

  doc.fillColor(INK).font('Helvetica-Bold').fontSize(17).text(schoolName, L + 52, doc.y - 34);
  if (contact) doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(contact, L + 52);
  else doc.moveDown(0.6);

  const titleTop = doc.y - 26;
  doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(11).text('TERMINAL REPORT', L, titleTop, { width: W, align: 'right' });
  doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(report.term || '', L, titleTop + 14, { width: W, align: 'right' });

  doc.moveTo(L, doc.y + 8).lineTo(L + W, doc.y + 8).lineWidth(2).strokeColor(BRAND).stroke();
  doc.moveDown(1.4);

  /* ---- student block ---- */
  const subjects = Object.entries(report.grades || {});
  const rows = subjects.map(([subject, v]) => {
    const ca = v?.ca != null ? Number(v.ca) : null;
    const exam = v?.exam != null ? Number(v.exam) : null;
    const total = v?.score != null ? Number(v.score) : ca != null && exam != null ? ca + exam : null;
    return { subject, ca, exam, total, remarks: v?.remarks || '' };
  });
  const scored = rows.filter((r) => r.total != null);
  const average = scored.length ? scored.reduce((a, r) => a + r.total, 0) / scored.length : Number(report.totalScore ?? 0);

  const blockTop = doc.y;
  doc.roundedRect(L, blockTop, W, 54, 8).fill('#f8fafc');
  const cell = (label, value, i) => {
    const x = L + 14 + (W / 4) * i;
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(7).text(label.toUpperCase(), x, blockTop + 12, { width: W / 4 - 14 });
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(11).text(value, x, blockTop + 26, { width: W / 4 - 14 });
  };
  cell('Student', student?.name || report.studentId, 0);
  cell('Class', student?.classId || '—', 1);
  cell('Student ID', student?.id || report.studentId, 2);
  cell('Average', `${Math.round(average)}%`, 3);
  doc.y = blockTop + 54;
  doc.moveDown(1);

  /* ---- subject table ---- */
  const cols = [
    { key: 'subject', label: 'Subject', w: W * 0.26, align: 'left' },
    { key: 'ca', label: `CA ${caMax}`, w: W * 0.09, align: 'right' },
    { key: 'exam', label: `Exam ${examMax}`, w: W * 0.1, align: 'right' },
    { key: 'total', label: 'Total', w: W * 0.09, align: 'right' },
    { key: 'grade', label: 'Grade', w: W * 0.1, align: 'center' },
    { key: 'remarks', label: 'Remark', w: W * 0.36, align: 'left' },
  ];

  const headTop = doc.y;
  doc.rect(L, headTop, W, 22).fill(BRAND);
  let x = L;
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
  cols.forEach((c) => {
    doc.text(c.label.toUpperCase(), x + 6, headTop + 7, { width: c.w - 12, align: c.align });
    x += c.w;
  });
  doc.y = headTop + 22;

  if (rows.length === 0) {
    doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(10)
      .text('No subject scores were recorded for this report.', L, doc.y + 12, { width: W, align: 'center' });
    doc.y += 34;
  } else {
    rows.forEach((r, i) => {
      const band = r.total != null ? gradeFor(r.total) : null;
      const top = doc.y;
      const h = 20;
      if (i % 2) doc.rect(L, top, W, h).fill('#f8fafc');
      let cx = L;
      const put = (text, c, colour, bold) => {
        doc.fillColor(colour).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
          .text(String(text), cx + 6, top + 6, { width: c.w - 12, align: c.align, ellipsis: true, height: 12 });
        cx += c.w;
      };
      put(r.subject, cols[0], INK, true);
      put(r.ca ?? '—', cols[1], '#334155');
      put(r.exam ?? '—', cols[2], '#334155');
      put(r.total ?? '—', cols[3], INK, true);
      put(band?.label ?? '—', cols[4], band ? TONE_HEX[band.tone] || INK : '#cbd5e1', true);
      put(r.remarks || '—', cols[5], MUTED);
      doc.y = top + h;
      doc.moveTo(L, doc.y).lineTo(L + W, doc.y).lineWidth(0.5).strokeColor(LINE).stroke();
    });
  }

  doc.moveDown(1.2);

  /* ---- summary ---- */
  const sumTop = doc.y;
  const overall = gradeFor(average);
  const tiles = [
    ['Subjects', String(scored.length)],
    ['Average', `${Math.round(average)}%`],
    ['Overall grade', overall?.label ?? report.grade ?? '—'],
  ];
  tiles.forEach(([label, value], i) => {
    const tw = (W - 16) / 3;
    const tx = L + i * (tw + 8);
    doc.roundedRect(tx, sumTop, tw, 44, 8).fill('#f1f5f9');
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(7).text(label.toUpperCase(), tx + 12, sumTop + 10);
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(15).text(value, tx + 12, sumTop + 22);
  });
  doc.y = sumTop + 44;
  doc.moveDown(1);

  /* ---- grading key ---- */
  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(7).text('GRADING KEY', L, doc.y);
  doc.moveDown(0.3);
  const keyLine = bands
    .slice()
    .sort((a, b) => b.minScore - a.minScore)
    .map((b) => `${b.label} ${b.minScore}-${b.maxScore} ${b.description || ''}`.trim())
    .join('    ');
  doc.fillColor('#334155').font('Helvetica').fontSize(8.5).text(keyLine, L, doc.y, { width: W });
  doc.moveDown(1);

  /* ---- remarks ---- */
  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(7).text("CLASS TEACHER'S REMARK", L, doc.y);
  doc.moveDown(0.3);
  const remarkTop = doc.y;
  doc.fillColor(INK).font('Helvetica').fontSize(10)
    .text(report.comments || 'No comments were recorded for this report.', L + 10, remarkTop, { width: W - 10 });
  doc.moveTo(L, remarkTop).lineTo(L, doc.y).lineWidth(2).strokeColor(BRAND).stroke();
  doc.moveDown(2);

  /* ---- signatures ---- */
  const sigTop = doc.y;
  ['Class teacher', 'Head teacher', 'Parent / guardian'].forEach((label, i) => {
    const sw = (W - 32) / 3;
    const sx = L + i * (sw + 16);
    doc.moveTo(sx, sigTop + 20).lineTo(sx + sw, sigTop + 20).lineWidth(0.8).strokeColor('#94a3b8').stroke();
    doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text(label, sx, sigTop + 26, { width: sw });
  });
  doc.y = sigTop + 44;

  doc.moveTo(L, doc.y).lineTo(L + W, doc.y).lineWidth(0.5).strokeColor(LINE).stroke();
  doc.fillColor('#94a3b8').font('Helvetica').fontSize(7.5)
    .text(`Approved and released via EduManage · ref ${report.id}`, L, doc.y + 8, { width: W, align: 'right' });

  doc.end();
  return doc;
}

export function pdfFilename(student, report) {
  const safe = (s) => String(s || '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${safe(student?.name) || 'report'}-${safe(report.term) || 'term'}.pdf`;
}
