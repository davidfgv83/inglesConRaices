// ─── Genre Translanguaging · Google Apps Script ───────────────────────────────
// Pega este código en Extensions → Apps Script de tu Google Sheet.
// Luego despliega como Web App:
//   Deploy → New deployment → Web app
//   Execute as: Me
//   Who has access: Anyone
// Copia la URL que te genera y pégala en js/main.js como SHEET_URL.
// ──────────────────────────────────────────────────────────────────────────────

const SHEET_NAME = 'Contactos'; // Cambia si tu hoja tiene otro nombre

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    let   sheet = ss.getSheetByName(SHEET_NAME);

    // Crear la hoja si no existe y agregar encabezados
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(['Timestamp', 'Nombre', 'Institución', 'Email', 'Mensaje']);
      sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
    }

    sheet.appendRow([
      new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
      data.nombre      || '',
      data.institucion || '',
      data.email       || '',
      data.mensaje     || '',
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ result: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ result: 'error', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Permite probar la Web App desde el navegador (GET devuelve estado)
function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ result: 'ok', status: 'Genre Translanguaging webhook activo' }))
    .setMimeType(ContentService.MimeType.JSON);
}
