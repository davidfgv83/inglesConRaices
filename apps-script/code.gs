// ─── Genre Translanguaging · Google Apps Script ───────────────────────────────
// Pega este código en Extensions → Apps Script de tu Google Sheet.
// Luego despliega como Web App:
//   Deploy → New deployment → Web app
//   Execute as: Me
//   Who has access: Anyone
// Copia la URL generada y pégala en js/main.js como SHEET_URL.
// ──────────────────────────────────────────────────────────────────────────────

// Correos que recibirán las notificaciones
const NOTIFY_EMAILS = [
  'genretranslanguaging@gmail.com',
  'davidfgv83@gmail.com',
  'andresrgg@gmail.com',
  'yagonzalezme@educacionbogota.edu.co'
];

// Nombre de la hoja donde se respaldan los contactos
const SHEET_NAME = 'Contactos';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const timestamp = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });

    // 1. Guardar en Google Sheet (respaldo)
    saveToSheet(data, timestamp);

    // 2. Enviar correo de notificación
    sendNotification(data, timestamp);

    return ContentService
      .createTextOutput(JSON.stringify({ result: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ result: 'error', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function saveToSheet(data, timestamp) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let   sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['Fecha', 'Nombre', 'Institución', 'Email', 'Mensaje']);
    sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
  }

  sheet.appendRow([
    timestamp,
    data.nombre      || '',
    data.institucion || '',
    data.email       || '',
    data.mensaje     || '',
  ]);
}

function sendNotification(data, timestamp) {
  const subject = '🟢 Nuevo contacto · Genre Translanguaging';

  const htmlBody = `
    <div style="font-family: 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e5e5e5; border-radius: 12px;">
      <h2 style="color: #2e6b4f; margin: 0 0 16px;">Nuevo mensaje desde la landing</h2>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr>
          <td style="padding: 10px 12px; font-weight: 600; color: #555; width: 110px; vertical-align: top;">Nombre</td>
          <td style="padding: 10px 12px;">${data.nombre || '—'}</td>
        </tr>
        <tr style="background: #f8f8f6;">
          <td style="padding: 10px 12px; font-weight: 600; color: #555; vertical-align: top;">Institución</td>
          <td style="padding: 10px 12px;">${data.institucion || '—'}</td>
        </tr>
        <tr>
          <td style="padding: 10px 12px; font-weight: 600; color: #555; vertical-align: top;">Email</td>
          <td style="padding: 10px 12px;"><a href="mailto:${data.email}" style="color: #2e6b4f;">${data.email || '—'}</a></td>
        </tr>
        <tr style="background: #f8f8f6;">
          <td style="padding: 10px 12px; font-weight: 600; color: #555; vertical-align: top;">Mensaje</td>
          <td style="padding: 10px 12px; white-space: pre-line;">${data.mensaje || '—'}</td>
        </tr>
      </table>
      <p style="font-size: 12px; color: #999; margin-top: 20px; border-top: 1px solid #eee; padding-top: 12px;">
        Recibido el ${timestamp} · genretranslanguaging.com
      </p>
    </div>
  `;

  const plainBody = `Nuevo contacto — Genre Translanguaging\n\nNombre: ${data.nombre}\nInstitución: ${data.institucion}\nEmail: ${data.email}\nMensaje: ${data.mensaje}\n\nRecibido: ${timestamp}`;

  NOTIFY_EMAILS.forEach(email => {
    MailApp.sendEmail({
      to: email,
      subject: subject,
      body: plainBody,
      htmlBody: htmlBody,
      replyTo: data.email || ''
    });
  });
}

// GET — permite probar que la Web App está activa
function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ result: 'ok', status: 'Genre Translanguaging webhook activo' }))
    .setMimeType(ContentService.MimeType.JSON);
}
