// ─── Event Publisher · Inglés con Raíces ─────────────────────────────────────
// Publica eventos automáticamente desde Google Forms → GitHub → inglesconraices.com
//
// SETUP:
// 1. Crea un Google Form con los campos definidos abajo
// 2. Vincula el Form a un Google Sheet (Respuestas → Abrir en Sheets)
// 3. En el Sheet: Extensiones → Apps Script → pega este código
// 4. Script Properties: GITHUB_TOKEN
// 5. Trigger: onFormSubmit → desde hoja de cálculo → al enviar formulario
//
// CAMPOS DEL FORM (en este orden):
//   1. Título del evento
//   2. Tipo (Taller / Conferencia / Congreso / Webinar / Otro)
//   3. Fecha
//   4. Hora
//   5. Lugar
//   6. Modalidad (Presencial / Virtual / Híbrido)
//   7. Descripción
//   8. Link de inscripción / más info (opcional)
//   9. Imagen del evento (carga de archivo - opcional)
//  10. Ponentes (opcional, separados por coma)
//  11. Correo del organizador
// ──────────────────────────────────────────────────────────────────────────────

var EV_CONFIG = {
  githubRepo:   'davidfgv83/inglesConRaices',
  notifyEmail:  'davidfgv83@gmail.com',
  eventsPath:   'eventos/events.json',
  imagesPath:   'eventos/images/',
  driveFolder:  'eventos-temp'
};

// ─── Trigger principal ────────────────────────────────────────────────────────

function onFormSubmit(e) {
  try {
    var response = e.namedValues;
    Logger.log('Respuesta recibida: ' + JSON.stringify(response));

    // Extraer campos (los nombres deben coincidir exactamente con el Form)
    var title       = getVal(response, 'Título del evento');
    var type        = getVal(response, 'Tipo');
    var dateRaw     = getVal(response, 'Fecha');
    var time        = getVal(response, 'Hora');
    var place       = getVal(response, 'Lugar');
    var modality    = getVal(response, 'Modalidad');
    var description = getVal(response, 'Descripción');
    var link        = getVal(response, 'Link de inscripción / más info');
    var imageUrl    = getVal(response, 'Imagen del evento');
    var speakersRaw = getVal(response, 'Ponentes');
    var organizer   = getVal(response, 'Correo del organizador');

    // Validar que el organizador sea un correo autorizado
    var authorizedEmails = [
      'yulygonza@gmail.com',
      'jaramirez1971@gmail.com',
      'davidfgv83@gmail.com'
    ];
    if (!organizer || authorizedEmails.indexOf(organizer.toLowerCase()) === -1) {
      Logger.log('Correo no autorizado: ' + organizer + ' — evento ignorado');
      MailApp.sendEmail({
        to: EV_CONFIG.notifyEmail,
        subject: '⚠️ Intento de publicación no autorizado',
        body: 'Alguien intentó publicar un evento desde un correo no autorizado.\n\nCorreo: ' + organizer + '\nTítulo: ' + getVal(response, 'Título del evento')
      });
      return;
    }

    // Parsear fecha — soporta dd/mm/yyyy y otros formatos
    var dateObj = parseDateFlexible(dateRaw);
    var dateISO   = dateObj ? Utilities.formatDate(dateObj, 'America/Bogota', 'yyyy-MM-dd') : dateRaw;
    var dateLabel = dateObj
      ? dateObj.toLocaleDateString('es-CO', { year:'numeric', month:'long', day:'numeric' })
      : dateRaw;

    // Parsear ponentes
    var speakers = speakersRaw
      ? speakersRaw.split(',').map(function(s) { return s.trim(); }).filter(Boolean)
      : [];

    // Generar slug
    var slug = makeEventSlug(title, dateISO);

    // Subir imagen si existe
    var imageName = null;
    if (imageUrl && imageUrl.indexOf('drive.google.com') > -1) {
      imageName = uploadImageFromDrive(imageUrl, slug);
    }

    var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');

    // Construir objeto del evento
    var event = {
      slug:        slug,
      title:       title,
      type:        type || 'Evento',
      date:        dateISO,
      dateLabel:   dateLabel,
      time:        time || '',
      place:       place || '',
      modality:    modality || 'Presencial',
      description: description || '',
      link:        link || null,
      image:       imageName,
      speakers:    speakers,
      organizer:   organizer || '',
      access:      'public'
    };

    // Actualizar events.json
    updateEventsJson(token, event);
    Logger.log('Evento publicado: ' + title);

    // Notificar al admin y al organizador
    var url = 'https://inglesconraices.com/eventos/';
    var emailBody = '¡Tu evento fue publicado en inglesconraices.com!\n\n'
      + 'Título: ' + title + '\n'
      + 'Fecha: ' + dateLabel + ' · ' + time + '\n'
      + 'Lugar: ' + place + '\n\n'
      + 'Ver en: ' + url;

    var recipients = [EV_CONFIG.notifyEmail];
    if (organizer && organizer !== EV_CONFIG.notifyEmail) {
      recipients.push(organizer);
    }

    recipients.forEach(function(email) {
      MailApp.sendEmail({
        to: email,
        subject: '✅ Evento publicado: "' + title + '"',
        body: emailBody
      });
    });

  } catch (err) {
    Logger.log('ERROR: ' + err.message);
    MailApp.sendEmail({
      to: EV_CONFIG.notifyEmail,
      subject: '❌ Error al publicar evento',
      body: 'Error: ' + err.message
    });
  }
}

// ─── Actualizar events.json ───────────────────────────────────────────────────

function updateEventsJson(token, event) {
  var path = EV_CONFIG.eventsPath;
  var events = [];
  var sha = null;
  var maxRetries = 3;

  for (var attempt = 0; attempt < maxRetries; attempt++) {
    events = []; sha = null;
    try {
      var res = UrlFetchApp.fetch('https://api.github.com/repos/' + EV_CONFIG.githubRepo + '/contents/' + path, {
        headers: { 'Authorization': 'token ' + token },
        muteHttpExceptions: true
      });
      if (res.getResponseCode() === 200) {
        var fd = JSON.parse(res.getContentText());
        sha = fd.sha;
        events = JSON.parse(Utilities.newBlob(Utilities.base64Decode(fd.content)).getDataAsString());
      }
    } catch(e) { Logger.log('events.json no existe aún'); }

    // Eliminar duplicados por slug
    events = events.filter(function(ev) { return ev.slug !== event.slug; });

    // Insertar al principio y ordenar por fecha descendente
    events.unshift(event);
    events.sort(function(a, b) {
      return (b.date || '').localeCompare(a.date || '');
    });

    var content = Utilities.base64Encode(Utilities.newBlob(JSON.stringify(events, null, 2)).getBytes());
    var payload = { message: 'Add event: "' + event.title + '"', content: content };
    if (sha) payload.sha = sha;

    var putRes = UrlFetchApp.fetch('https://api.github.com/repos/' + EV_CONFIG.githubRepo + '/contents/' + path, {
      method: 'PUT',
      headers: { 'Authorization': 'token ' + token, 'Content-Type': 'application/json' },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var code = putRes.getResponseCode();
    if (code === 200 || code === 201) { Logger.log('events.json actualizado'); return; }
    Logger.log('Intento ' + (attempt+1) + ' falló (' + code + '). Reintentando...');
    Utilities.sleep(2000);
  }
  throw new Error('No se pudo actualizar events.json después de 3 intentos');
}

// ─── Subir imagen desde Drive ─────────────────────────────────────────────────

function uploadImageFromDrive(driveUrl, slug) {
  try {
    // Extraer file ID de la URL de Drive
    var idMatch = driveUrl.match(/[-\w]{25,}/);
    if (!idMatch) return null;
    var file = DriveApp.getFileById(idMatch[0]);
    var mimeType = file.getMimeType();
    var ext = mimeType.indexOf('png') > -1 ? '.png' : '.jpg';
    var imageName = slug + ext;
    var bytes = file.getBlob().getBytes();
    var b64 = Utilities.base64Encode(bytes);

    var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
    var path = EV_CONFIG.imagesPath + imageName;
    var sha = null;

    var check = UrlFetchApp.fetch('https://api.github.com/repos/' + EV_CONFIG.githubRepo + '/contents/' + path, {
      headers: { 'Authorization': 'token ' + token }, muteHttpExceptions: true
    });
    if (check.getResponseCode() === 200) sha = JSON.parse(check.getContentText()).sha;

    var payload = { message: 'Add event image: ' + imageName, content: b64 };
    if (sha) payload.sha = sha;

    UrlFetchApp.fetch('https://api.github.com/repos/' + EV_CONFIG.githubRepo + '/contents/' + path, {
      method: 'PUT',
      headers: { 'Authorization': 'token ' + token, 'Content-Type': 'application/json' },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    Logger.log('Imagen subida: ' + imageName);
    return imageName;
  } catch(err) {
    Logger.log('Error al subir imagen: ' + err.message);
    return null;
  }
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

function makeEventSlug(title, date) {
  var titleSlug = title.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').substring(0,40);
  var dateSuffix = date ? '-' + date : '';
  return titleSlug + dateSuffix;
}

function getVal(namedValues, key) {
  if (!namedValues || !namedValues[key]) return '';
  var arr = namedValues[key];
  return Array.isArray(arr) ? (arr[0] || '').trim() : (arr || '').trim();
}

function parseDateFlexible(raw) {
  if (!raw) return null;
  // dd/mm/yyyy o d/m/yyyy
  var dmyMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmyMatch) {
    return new Date(parseInt(dmyMatch[3]), parseInt(dmyMatch[2]) - 1, parseInt(dmyMatch[1]));
  }
  // yyyy-mm-dd
  var isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
  }
  // Intentar parse nativo
  var d = new Date(raw);
  return isNaN(d) ? null : d;
}
