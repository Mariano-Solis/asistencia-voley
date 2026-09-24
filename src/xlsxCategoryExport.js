const encoder = new TextEncoder();
let sharedStrings = [];
let sharedStringIndex = new Map();
let sharedStringUses = 0;

function resetSharedStrings() {
  sharedStrings = [];
  sharedStringIndex = new Map();
  sharedStringUses = 0;
}

function sharedStringId(value) {
  const text = String(value ?? "");
  sharedStringUses += 1;
  if (sharedStringIndex.has(text)) return sharedStringIndex.get(text);
  const index = sharedStrings.length;
  sharedStrings.push(text);
  sharedStringIndex.set(text, index);
  return index;
}

function sharedStringsXml() {
  const items = sharedStrings
    .map(value => '<si><t xml:space="preserve">' + xmlEscape(value) + '</t></si>')
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStringUses}" uniqueCount="${sharedStrings.length}">${items}</sst>`;
}

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function colName(index) {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function cell(ref, value, style = 0, type = "text") {
  if (value === null || value === undefined || value === "") {
    return '<c r="' + ref + '" s="' + style + '"/>';
  }
  if (type === "number") {
    return '<c r="' + ref + '" s="' + style + '" t="n"><v>' + Number(value) + '</v></c>';
  }
  return '<c r="' + ref + '" s="' + style + '" t="s"><v>' + sharedStringId(value) + '</v></c>';
}

function rowXml(rowNumber, cells, height = null) {
  const ht = height ? ' ht="' + height + '" customHeight="1"' : "";
  return '<row r="' + rowNumber + '"' + ht + '>' + cells.join("") + "</row>";
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value) {
  return new Uint8Array([value & 255, (value >>> 8) & 255]);
}

function u32(value) {
  return new Uint8Array([
    value & 255,
    (value >>> 8) & 255,
    (value >>> 16) & 255,
    (value >>> 24) & 255,
  ]);
}

function concat(parts) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function zipStore(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const stamp = dosDateTime();

  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = typeof file.data === "string" ? encoder.encode(file.data) : file.data;
    const crc = crc32(data);

    const localHeader = concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(stamp.time), u16(stamp.day),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name,
    ]);
    localParts.push(localHeader, data);

    const centralHeader = concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(stamp.time), u16(stamp.day),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), name,
    ]);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const central = concat(centralParts);
  const locals = concat(localParts);
  const end = concat([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(central.length), u32(locals.length), u16(0),
  ]);
  return concat([locals, central, end]);
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="6">
    <font><sz val="11"/><name val="Aptos"/><family val="2"/></font>
    <font><b/><sz val="18"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/></font>
    <font><b/><sz val="12"/><color rgb="FFB5121B"/><name val="Aptos"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font>
    <font><b/><sz val="20"/><color rgb="FF20242A"/><name val="Aptos Display"/></font>
    <font><b/><sz val="11"/><color rgb="FF20242A"/><name val="Aptos"/></font>
  </fonts>
  <fills count="6">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFB5121B"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFF0F1"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF4F5F7"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="3">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFE1E4E8"/></left><right style="thin"><color rgb="FFE1E4E8"/></right>
      <top style="thin"><color rgb="FFE1E4E8"/></top><bottom style="thin"><color rgb="FFE1E4E8"/></bottom><diagonal/>
    </border>
    <border>
      <left style="thin"><color rgb="FFD6AEB2"/></left><right style="thin"><color rgb="FFD6AEB2"/></right>
      <top style="thin"><color rgb="FFD6AEB2"/></top><bottom style="thin"><color rgb="FFD6AEB2"/></bottom><diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="14">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="3" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="5" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="5" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="5" fillId="3" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function buildSheetXml({ appName, title, exportDate, selectionText, total, female, male, categoryRows, unassignedCount }) {
  const rows = [];
  rows.push(rowXml(1, [cell("A1", appName, 1)], 32));
  rows.push(rowXml(2, [cell("A2", title, 2)], 24));
  rows.push(rowXml(3, [cell("A3", "Fecha De Exportaci\u00f3n", 3), cell("B3", exportDate, 4)], 22));
  rows.push(rowXml(4, [cell("A4", "Categor\u00edas Incluidas", 3), cell("B4", selectionText, 4)], 32));
  rows.push(rowXml(6, [cell("A6", "Total De Jugador@s", 5), cell("B6", "Femenino", 5), cell("C6", "Masculino", 5)], 24));
  rows.push(rowXml(7, [cell("A7", total, 6, "number"), cell("B7", female, 6, "number"), cell("C7", male, 6, "number")], 34));
  rows.push(rowXml(9, [cell("A9", "Detalle Por Categor\u00eda", 7)], 24));
  rows.push(rowXml(10, [cell("A10", "Rama", 8), cell("B10", "Categor\u00eda", 8), cell("C10", "Cantidad", 8)], 24));

  let r = 11;
  categoryRows.forEach((entry, index) => {
    const styleText = index % 2 === 0 ? 9 : 11;
    const styleNumber = index % 2 === 0 ? 10 : 12;
    rows.push(rowXml(r, [
      cell("A" + r, entry[0], styleText),
      cell("B" + r, entry[1], styleText),
      cell("C" + r, entry[2], styleNumber, "number"),
    ], 21));
    r++;
  });

  if (unassignedCount > 0) {
    const index = categoryRows.length;
    const styleText = index % 2 === 0 ? 9 : 11;
    const styleNumber = index % 2 === 0 ? 10 : 12;
    rows.push(rowXml(r, [cell("A" + r, "\u2014", styleText), cell("B" + r, "Sin Categor\u00eda", styleText), cell("C" + r, unassignedCount, styleNumber, "number")], 21));
    r++;
  }

  const totalRow = r + 1;
  rows.push(rowXml(totalRow, [cell("A" + totalRow, "TOTAL", 13), cell("B" + totalRow, "Jugador@s Incluidos", 13), cell("C" + totalRow, total, 13, "number")], 24));

  const mergeRefs = ["A1:C1", "A2:C2", "B3:C3", "B4:C4", "A9:C9"];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:C${totalRow}"/>
  <sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="10" topLeftCell="A11" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols><col min="1" max="1" width="20" customWidth="1"/><col min="2" max="2" width="34" customWidth="1"/><col min="3" max="3" width="15" customWidth="1"/></cols>
  <sheetData>${rows.join("")}</sheetData>
  <mergeCells count="${mergeRefs.length}">${mergeRefs.map(ref => '<mergeCell ref="' + ref + '"/>').join("")}</mergeCells>
  <autoFilter ref="A10:C${Math.max(10, r - 1)}"/>
  <pageMargins left="0.4" right="0.4" top="0.6" bottom="0.6" header="0.2" footer="0.2"/>
  <pageSetup orientation="portrait" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
}


function buildPlayerDetailsSheetXml({ appName, exportDate, selectionText, playerRows = [] }) {
  const rows = [];
  rows.push(rowXml(1, [cell("A1", appName, 1)], 32));
  rows.push(rowXml(2, [cell("A2", "Detalle De Jugador@s", 2)], 24));
  rows.push(rowXml(3, [cell("A3", "Fecha De Exportación", 3), cell("B3", exportDate, 4)], 22));
  rows.push(rowXml(4, [cell("A4", "Categorías Incluidas", 3), cell("B4", selectionText, 4)], 32));
  rows.push(rowXml(6, [
    cell("A6", "Apellido", 8),
    cell("B6", "Nombre", 8),
    cell("C6", "DNI", 8),
    cell("D6", "Rama", 8),
    cell("E6", "Categoría", 8),
    cell("F6", "Equipo", 8),
    cell("G6", "Código De Acceso", 8),
    cell("H6", "Fecha De Creación De Cuenta", 8),
  ], 30));

  let rowNumber = 7;
  playerRows.forEach((player, index) => {
    const styleText = index % 2 === 0 ? 9 : 11;
    rows.push(rowXml(rowNumber, [
      cell("A" + rowNumber, player.lastName || "—", styleText),
      cell("B" + rowNumber, player.firstName || "—", styleText),
      cell("C" + rowNumber, player.dni || "—", styleText),
      cell("D" + rowNumber, player.branch || "—", styleText),
      cell("E" + rowNumber, player.category || "Sin Categoría", styleText),
      cell("F" + rowNumber, player.team || "Sin Asignar", styleText),
      cell("G" + rowNumber, player.accessCode || "—", styleText),
      cell("H" + rowNumber, player.createdAt || "—", styleText),
    ], 22));
    rowNumber++;
  });

  const totalRow = rowNumber + 1;
  rows.push(rowXml(totalRow, [
    cell("A" + totalRow, "TOTAL", 13),
    cell("B" + totalRow, "Jugador@s Incluidos", 13),
    cell("H" + totalRow, playerRows.length, 13, "number"),
  ], 24));

  const mergeRefs = ["A1:H1", "A2:H2", "B3:H3", "B4:H4"];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:H${totalRow}"/>
  <sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="6" topLeftCell="A7" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>
    <col min="1" max="1" width="24" customWidth="1"/>
    <col min="2" max="2" width="24" customWidth="1"/>
    <col min="3" max="3" width="16" customWidth="1"/>
    <col min="4" max="4" width="14" customWidth="1"/>
    <col min="5" max="5" width="20" customWidth="1"/>
    <col min="6" max="6" width="16" customWidth="1"/>
    <col min="7" max="7" width="20" customWidth="1"/>
    <col min="8" max="8" width="25" customWidth="1"/>
  </cols>
  <sheetData>${rows.join("")}</sheetData>
  <mergeCells count="${mergeRefs.length}">${mergeRefs.map(ref => '<mergeCell ref="' + ref + '"/>').join("")}</mergeCells>
  <autoFilter ref="A6:H${Math.max(6, rowNumber - 1)}"/>
  <pageMargins left="0.35" right="0.35" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
  <pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
}

function safeSheetName(value, fallback = "Categoría") {
  const cleaned = String(value || fallback)
    .replace(/[\\/*?:\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || fallback;
  return cleaned.slice(0, 31);
}

function uniqueSheetNames(names) {
  const used = new Set();
  return names.map((name, index) => {
    const base = safeSheetName(name, "Categoría " + (index + 1));
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate.toLowerCase())) {
      const tail = " " + suffix;
      candidate = base.slice(0, Math.max(1, 31 - tail.length)) + tail;
      suffix++;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

function buildCategoryPlayersSheetXml({ appName, exportDate, categoryLabel, playerRows = [] }) {
  const rows = [];
  rows.push(rowXml(1, [cell("A1", appName, 1)], 32));
  rows.push(rowXml(2, [cell("A2", categoryLabel, 2)], 24));
  rows.push(rowXml(3, [cell("A3", "Fecha De Exportación", 3), cell("B3", exportDate, 4)], 22));
  rows.push(rowXml(5, [
    cell("A5", "Apellido", 8),
    cell("B5", "Nombre", 8),
    cell("C5", "Código Personal", 8),
    cell("D5", "Categoría", 8),
    cell("E5", "Fecha De Creación De Cuenta", 8),
  ], 30));

  let rowNumber = 6;
  playerRows.forEach((player, index) => {
    const styleText = index % 2 === 0 ? 9 : 11;
    rows.push(rowXml(rowNumber, [
      cell("A" + rowNumber, player.lastName || "—", styleText),
      cell("B" + rowNumber, player.firstName || "—", styleText),
      cell("C" + rowNumber, player.accessCode || "—", styleText),
      cell("D" + rowNumber, player.category || categoryLabel || "—", styleText),
      cell("E" + rowNumber, player.createdAt || "—", styleText),
    ], 22));
    rowNumber++;
  });

  const totalRow = rowNumber + 1;
  rows.push(rowXml(totalRow, [
    cell("A" + totalRow, "TOTAL", 13),
    cell("B" + totalRow, "Jugador@s Incluidos", 13),
    cell("E" + totalRow, playerRows.length, 13, "number"),
  ], 24));

  const mergeRefs = ["A1:E1", "A2:E2", "B3:E3"];
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<dimension ref="A1:E' + totalRow + '"/>' +
    '<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="18"/>' +
    '<cols><col min="1" max="1" width="26" customWidth="1"/><col min="2" max="2" width="24" customWidth="1"/><col min="3" max="3" width="20" customWidth="1"/><col min="4" max="4" width="22" customWidth="1"/><col min="5" max="5" width="26" customWidth="1"/></cols>' +
    '<sheetData>' + rows.join("") + '</sheetData>' +
    '<mergeCells count="' + mergeRefs.length + '">' + mergeRefs.map(ref => '<mergeCell ref="' + ref + '"/>').join("") + '</mergeCells>' +
    '<autoFilter ref="A5:E' + Math.max(5, rowNumber - 1) + '"/>' +
    '<pageMargins left="0.35" right="0.35" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>' +
    '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>' +
    '</worksheet>';
}

export function exportCategoryWorkbook({
  appName,
  title = "Resumen De Jugador@s Por Categor\u00eda",
  exportDate,
  selectionText,
  total,
  female,
  male,
  categoryRows,
  playerRows = [],
  unassignedCount = 0,
  filename,
}) {
  const created = new Date().toISOString();
  resetSharedStrings();
  const sheetXml = buildSheetXml({ appName, title, exportDate, selectionText, total, female, male, categoryRows, unassignedCount });
  const playerSheetXml = buildPlayerDetailsSheetXml({ appName, exportDate, selectionText, playerRows });
  const stringsXml = sharedStringsXml();

  const files = [
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>` },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` },
    { name: "docProps/app.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>MGSM VOLEY</Application><AppVersion>1.0</AppVersion></Properties>` },
    { name: "docProps/core.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(title)}</dc:title><dc:creator>Municipalidad De San Mart\u00edn - VOLEY</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified></cp:coreProperties>` },
    { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="16000" windowHeight="9000"/></bookViews><sheets><sheet name="Resumen" sheetId="1" r:id="rId1"/><sheet name="Jugador@s" sheetId="2" r:id="rId2"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>` },
    { name: "xl/styles.xml", data: stylesXml() },
    { name: "xl/sharedStrings.xml", data: stringsXml },
    { name: "xl/worksheets/sheet1.xml", data: sheetXml },
    { name: "xl/worksheets/sheet2.xml", data: playerSheetXml },
  ];

  const bytes = zipStore(files);
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || "resumen-jugadores.xlsx";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}


function buildAttendanceReportSheetXml({
  appName,
  categoryLabel,
  periodLabel,
  exportDate,
  sessionColumns,
  playerRows,
  totals,
}) {
  const totalColumns = Math.max(10, 1 + sessionColumns.length + 3);
  const lastCol = colName(totalColumns - 1);
  const rows = [];
  rows.push(rowXml(1, [cell("A1", appName, 1)], 32));
  rows.push(rowXml(2, [cell("A2", "Informe De Asistencia", 2)], 24));
  rows.push(rowXml(3, [cell("A3", "Categoría", 3), cell("B3", categoryLabel, 4)], 22));
  rows.push(rowXml(4, [cell("A4", "Período", 3), cell("B4", periodLabel, 4)], 22));
  rows.push(rowXml(5, [cell("A5", "Fecha De Exportación", 3), cell("B5", exportDate, 4)], 22));

  rows.push(rowXml(7, [
    cell("A7", "Sesiones", 5),
    cell("B7", sessionColumns.length, 6, "number"),
    cell("C7", "Jugador@s", 5),
    cell("D7", playerRows.length, 6, "number"),
    cell("E7", "Presentes", 5),
    cell("F7", totals.present, 6, "number"),
    cell("G7", "Tardanzas", 5),
    cell("H7", totals.late, 6, "number"),
    cell("I7", "Ausencias", 5),
    cell("J7", totals.absent, 6, "number"),
  ], 28));

  const headerCells = [cell("A9", "Jugador@", 8)];
  sessionColumns.forEach((session, index) => {
    headerCells.push(cell(colName(index + 1) + "9", session.label, 8));
  });
  const presentCol = colName(1 + sessionColumns.length);
  const lateCol = colName(2 + sessionColumns.length);
  const absentCol = colName(3 + sessionColumns.length);
  headerCells.push(cell(presentCol + "9", "Presentes", 8));
  headerCells.push(cell(lateCol + "9", "Tardanzas", 8));
  headerCells.push(cell(absentCol + "9", "Ausencias", 8));
  rows.push(rowXml(9, headerCells, 30));

  let rowNumber = 10;
  playerRows.forEach((player, index) => {
    const styleText = index % 2 === 0 ? 9 : 11;
    const styleNumber = index % 2 === 0 ? 10 : 12;
    const rowCells = [cell("A" + rowNumber, player.name, styleText)];
    player.statuses.forEach((status, statusIndex) => {
      rowCells.push(cell(colName(statusIndex + 1) + rowNumber, status, styleNumber));
    });
    rowCells.push(cell(presentCol + rowNumber, player.present, styleNumber, "number"));
    rowCells.push(cell(lateCol + rowNumber, player.late, styleNumber, "number"));
    rowCells.push(cell(absentCol + rowNumber, player.absent, styleNumber, "number"));
    rows.push(rowXml(rowNumber, rowCells, 22));
    rowNumber++;
  });

  const totalRow = rowNumber + 1;
  rows.push(rowXml(totalRow, [
    cell("A" + totalRow, "TOTALES", 13),
    cell(presentCol + totalRow, totals.present, 13, "number"),
    cell(lateCol + totalRow, totals.late, 13, "number"),
    cell(absentCol + totalRow, totals.absent, 13, "number"),
  ], 24));

  const mergeRefs = [
    `A1:${lastCol}1`,
    `A2:${lastCol}2`,
    `B3:${lastCol}3`,
    `B4:${lastCol}4`,
    `B5:${lastCol}5`,
  ];

  const dateCols = sessionColumns.length
    ? `<col min="2" max="${1 + sessionColumns.length}" width="16" customWidth="1"/>`
    : "";
  const summaryStart = 2 + sessionColumns.length;
  const summaryEnd = 4 + sessionColumns.length;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastCol}${totalRow}"/>
  <sheetViews>
    <sheetView workbookViewId="0" showGridLines="0">
      <pane xSplit="1" ySplit="9" topLeftCell="B10" activePane="bottomRight" state="frozen"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>
    <col min="1" max="1" width="30" customWidth="1"/>
    ${dateCols}
    <col min="${summaryStart}" max="${summaryEnd}" width="12" customWidth="1"/>
  </cols>
  <sheetData>${rows.join("")}</sheetData>
  <mergeCells count="${mergeRefs.length}">${mergeRefs.map(ref => '<mergeCell ref="' + ref + '"/>').join("")}</mergeCells>
  <autoFilter ref="A9:${lastCol}${Math.max(9, rowNumber - 1)}"/>
  <pageMargins left="0.35" right="0.35" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
  <pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
}

function downloadXlsx({ title, sheetName, sheetXml, filename }) {
  const created = new Date().toISOString();
  const stringsXml = sharedStringsXml();
  const safeSheetName = String(sheetName || "Informe").slice(0, 31).replace(/[\\/?*\[\]:]/g, " ");

  const files = [
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>` },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` },
    { name: "docProps/app.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>MGSM VOLEY</Application><AppVersion>1.0</AppVersion></Properties>` },
    { name: "docProps/core.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(title)}</dc:title><dc:creator>Municipalidad De San Martín - VOLEY</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified></cp:coreProperties>` },
    { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="16000" windowHeight="9000"/></bookViews><sheets><sheet name="${xmlEscape(safeSheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>` },
    { name: "xl/styles.xml", data: stylesXml() },
    { name: "xl/sharedStrings.xml", data: stringsXml },
    { name: "xl/worksheets/sheet1.xml", data: sheetXml },
  ];

  const bytes = zipStore(files);
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

export function exportAttendanceWorkbook({
  appName,
  categoryLabel,
  periodLabel,
  exportDate,
  sessionColumns,
  playerRows,
  totals,
  filename,
}) {
  resetSharedStrings();
  const sheetXml = buildAttendanceReportSheetXml({
    appName,
    categoryLabel,
    periodLabel,
    exportDate,
    sessionColumns,
    playerRows,
    totals,
  });
  downloadXlsx({
    title: `Informe De Asistencia · ${categoryLabel}`,
    sheetName: "Asistencia",
    sheetXml,
    filename: filename || "informe-asistencia.xlsx",
  });
}
