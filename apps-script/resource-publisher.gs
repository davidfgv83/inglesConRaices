// ─── Resource Publisher · Inglés con Raíces ──────────────────────────────────
// Flujo: Email con RECURSO: + .zip → extrae en Drive → formatea CSS →
//        sube a GitHub → notifica a David → responde "OK" → publica.
//
// SETUP (mismo proyecto que blog-publisher.gs, o proyecto separado):
// 1. Script Properties: GITHUB_TOKEN, SHEET_ID
// 2. Crear DOS triggers de tiempo (cada 5 min):
//    - checkForResourceEmails
//    - checkForResourceApprovals
//
// FORMATO DEL CORREO:
//   Para: genretranslanguaging@gmail.com
//   Asunto: RECURSO: [Unidad 1 · 4° Grado] Juana y su vida en el Chocó
//   Adjunto: nombre_del_recurso.zip
//   (el zip debe contener: index.html + styles.css + script.js)
// ──────────────────────────────────────────────────────────────────────────────

var RES_CONFIG = {
  authorizedEmails: [
    'yagonzalezme@educacionbogota.edu.co',
    'andresrgg@gmail.com',
    'davidfgv83@gmail.com'
  ],
  approverEmail:          'davidfgv83@gmail.com',
  githubRepo:             'davidfgv83/inglesConRaices',
  sheetName:              'Recursos-Borradores',
  subjectPrefix:          'RECURSO:',
  approvalSubjectPrefix:  '🎮 Recurso pendiente:',
  driveFolder:            'recursos-temp',
  resourceThemePath:      '../../css/resource-theme.css',
  siteNavHtml: '<nav class="icr-site-bar">\n'
    + '  <a href="../../" class="icr-site-bar-brand">'
    + '<div class="icr-site-bar-dot"></div>'
    + '<span>inglesconraices.com</span></a>\n'
    + '  <a href="../" class="icr-back-btn">← Recursos</a>\n'
    + '</nav>\n'
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getResSheet() {
  var sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(RES_CONFIG.sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(RES_CONFIG.sheetName);
    sheet.appendRow(['ID','Fecha','Autor','Título','Slug','Unidad','Grado','Tema','Actividades','Estado']);
    sheet.getRange(1,1,1,10).setFontWeight('bold');
  }
  return sheet;
}

function extractEmailAddr(from) {
  var m = from.match(/<(.+)>/);
  return m ? m[1] : from;
}

function makeSlug(text) {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-|-$/g,'')
    .substring(0,60) || ('recurso-' + Date.now());
}

function getOrCreateDriveFolder(name) {
  var folders = DriveApp.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(name);
}

function getToken() {
  return PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
}

// ─── Commit a GitHub ─────────────────────────────────────────────────────────

function commitResFile(token, repo, path, contentBase64, message) {
  var sha = null;
  try {
    var res = UrlFetchApp.fetch('https://api.github.com/repos/' + repo + '/contents/' + path, {
      headers: { 'Authorization': 'token ' + token },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) {
      sha = JSON.parse(res.getContentText()).sha;
    }
  } catch(e) {}

  var payload = { message: message, content: contentBase64 };
  if (sha) payload.sha = sha;

  var putRes = UrlFetchApp.fetch('https://api.github.com/repos/' + repo + '/contents/' + path, {
    method: 'PUT',
    headers: { 'Authorization': 'token ' + token, 'Content-Type': 'application/json' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var code = putRes.getResponseCode();
  if (code !== 200 && code !== 201) {
    Logger.log('GitHub error ' + code + ' for ' + path + ': ' + putRes.getContentText().substring(0,200));
  }
  return code;
}

// ─── Actualizar units.json ────────────────────────────────────────────────────

function updateUnitsJson(token, repo, unit) {
  var path = 'recursos/units.json';
  var units = [];
  var sha = null;
  var maxRetries = 3;

  for (var attempt = 0; attempt < maxRetries; attempt++) {
    units = []; sha = null;
    try {
      var res = UrlFetchApp.fetch('https://api.github.com/repos/' + repo + '/contents/' + path, {
        headers: { 'Authorization': 'token ' + token },
        muteHttpExceptions: true
      });
      if (res.getResponseCode() === 200) {
        var fd = JSON.parse(res.getContentText());
        sha = fd.sha;
        units = JSON.parse(Utilities.newBlob(Utilities.base64Decode(fd.content)).getDataAsString());
      }
    } catch(e) {}

    // Evitar duplicados
    units = units.filter(function(u) { return u.slug !== unit.slug; });
    units.unshift(unit);

    var content = Utilities.base64Encode(Utilities.newBlob(JSON.stringify(units, null, 2)).getBytes());
    var payload = { message: 'Update units.json: add "' + unit.title + '"', content: content };
    if (sha) payload.sha = sha;

    var putRes = UrlFetchApp.fetch('https://api.github.com/repos/' + repo + '/contents/' + path, {
      method: 'PUT',
      headers: { 'Authorization': 'token ' + token, 'Content-Type': 'application/json' },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var code = putRes.getResponseCode();
    if (code === 200 || code === 201) {
      Logger.log('units.json actualizado');
      return;
    }
    Logger.log('Intento ' + (attempt+1) + ' falló (' + code + '). Reintentando...');
    Utilities.sleep(2000);
  }
  Logger.log('ERROR: No se pudo actualizar units.json');
}

// ─── TRIGGER 1: Recibir correo con .zip ──────────────────────────────────────

function checkForResourceEmails() {
  var threads = GmailApp.search('subject:"' + RES_CONFIG.subjectPrefix + '" is:unread');
  Logger.log('Threads RECURSO: ' + threads.length);

  for (var t = 0; t < threads.length; t++) {
    var thread = threads[t];
    var msg = thread.getMessages()[0];
    var from = extractEmailAddr(msg.getFrom());
    Logger.log('From: ' + from);

    if (RES_CONFIG.authorizedEmails.indexOf(from.toLowerCase()) === -1) {
      Logger.log('No autorizado');
      continue;
    }

    var subject = msg.getSubject() || '';
    // Asunto: RECURSO: [Unidad 1 · 4° Grado] Título del recurso
    var rawMeta = subject.replace(new RegExp(RES_CONFIG.subjectPrefix + '\\s*','i'),'').trim();

    // Extraer meta entre corchetes: [Unidad N · Xº Grado]
    var metaMatch = rawMeta.match(/^\[([^\]]+)\]\s*/);
    var unit = 'Unidad 1';
    var grade = '';
    var cleanTitle = rawMeta;

    if (metaMatch) {
      var metaStr = metaMatch[1];
      cleanTitle = rawMeta.replace(metaMatch[0],'').trim();
      // Buscar número de unidad
      var unitMatch = metaStr.match(/[Uu]nidad\s*(\d+)/);
      if (unitMatch) unit = 'Unidad ' + unitMatch[1];
      // Buscar grado: 3°, 4°, 5°, 3rd, 4th, 5th
      var gradeMatch = metaStr.match(/(\d)[°º]?\s*[Gg]rado?/);
      if (!gradeMatch) gradeMatch = metaStr.match(/(\d)(?:st|nd|rd|th)/);
      if (gradeMatch) grade = gradeMatch[1];
    }

    if (!cleanTitle) cleanTitle = rawMeta || 'Recurso sin título';
    var slug = makeSlug(cleanTitle);
    Logger.log('Título: ' + cleanTitle + ' | Unidad: ' + unit + ' | Grado: ' + grade);

    // Autor
    var authorName = 'David Julián Castaño';
    if (from.toLowerCase().indexOf('yagonzalez') > -1) authorName = 'Dra. Yuly González';
    else if (from.toLowerCase().indexOf('andresrgg') > -1) authorName = 'Dr. Andrés Ramírez';

    var id = Utilities.getUuid();
    var date = new Date().toLocaleDateString('es-CO',{year:'numeric',month:'long',day:'numeric'});

    // Buscar adjunto .zip
    var attachments = msg.getAttachments();
    var zipAtt = null;
    for (var a = 0; a < attachments.length; a++) {
      if (attachments[a].getName().toLowerCase().endsWith('.zip')) {
        zipAtt = attachments[a]; break;
      }
    }

    if (!zipAtt) {
      Logger.log('No se encontró adjunto .zip — ignorando');
      thread.markRead();
      continue;
    }

    // Guardar .zip en Drive y extraer contenido
    var tempFolder = getOrCreateDriveFolder(RES_CONFIG.driveFolder);
    var zipFile = tempFolder.createFile(zipAtt.copyBlob().setName(slug + '.zip'));
    Logger.log('ZIP guardado en Drive: ' + zipFile.getId());

    // Extraer ZIP usando Drive API (convierte a carpeta)
    var extractedFolderId = extractZipInDrive(zipFile);
    Logger.log('Carpeta extraída: ' + extractedFolderId);

    // Contar actividades (secciones de juego en el HTML)
    var activityCount = countActivities(extractedFolderId);
    Logger.log('Actividades detectadas: ' + activityCount);

    // Guardar en Sheet como borrador
    var sheet = getResSheet();
    sheet.appendRow([id, date, authorName, cleanTitle, slug, unit, grade, '', activityCount, 'borrador']);
    Logger.log('Guardado en Sheet: ' + id);

    // Archivar correo
    thread.markRead();
    GmailApp.moveThreadToArchive(thread);

    // Notificar al aprobador
    sendResourceApprovalEmail(id, cleanTitle, unit, grade, activityCount, authorName, date);
    Logger.log('Notificación enviada');
  }
}

// ─── Extraer ZIP usando Drive API ────────────────────────────────────────────

function extractZipInDrive(zipFile) {
  // Drive puede convertir .zip a carpeta usando la API REST
  var token = ScriptApp.getOAuthToken();
  var fileId = zipFile.getId();

  // Crear carpeta destino
  var tempFolder = getOrCreateDriveFolder(RES_CONFIG.driveFolder);
  var extractFolder = tempFolder.createFolder(zipFile.getName().replace('.zip',''));

  // Usar Advanced Drive Service para extraer
  // Como alternativa robusta: leer el ZIP con Utilities.unzip
  var zipBlob = zipFile.getBlob();
  var unzipped = Utilities.unzip(zipBlob);
  Logger.log('Archivos en el ZIP: ' + unzipped.length);

  for (var i = 0; i < unzipped.length; i++) {
    var blob = unzipped[i];
    var name = blob.getName();
    // Ignorar rutas de directorio y archivos ocultos
    if (!name || name.endsWith('/') || name.indexOf('__MACOSX') > -1 || name.indexOf('.DS_Store') > -1) continue;
    // Aplanar estructura: si viene como "carpeta/archivo.ext", usar solo "archivo.ext"
    var flatName = name.split('/').pop();
    if (!flatName) continue;
    Logger.log('Extrayendo: ' + flatName);
    extractFolder.createFile(blob.setName(flatName));
  }

  // Eliminar el .zip original
  zipFile.setTrashed(true);

  return extractFolder.getId();
}

// ─── Contar actividades en el HTML ───────────────────────────────────────────

function countActivities(folderId) {
  var folder = DriveApp.getFolderById(folderId);
  var files = folder.getFilesByName('index.html');
  if (!files.hasNext()) return 0;
  var html = files.next().getBlob().getDataAsString();
  // Contar secciones .game o data-game
  var matches = html.match(/data-game=/g);
  return matches ? matches.length : 0;
}

// ─── Enviar correo de aprobación ─────────────────────────────────────────────

function sendResourceApprovalEmail(id, title, unit, grade, activities, author, date) {
  var gradeStr = grade ? grade + '° grado · ' : '';
  var htmlBody = '<div style="font-family:sans-serif;max-width:560px;padding:24px;border:1px solid #e5e5e5;border-radius:12px;">'
    + '<h2 style="color:#2e6b4f;">🎮 Nuevo recurso pendiente</h2>'
    + '<p><strong>Título:</strong> ' + title + '</p>'
    + '<p><strong>Unidad:</strong> ' + unit + ' · ' + gradeStr + activities + ' actividades</p>'
    + '<p><strong>Autor:</strong> ' + author + '</p>'
    + '<p><strong>Fecha:</strong> ' + date + '</p>'
    + '<p><strong>ID:</strong> <code>' + id + '</code></p>'
    + '<p style="margin-top:16px;font-size:14px;color:#2e6b4f;font-weight:bold;">👉 Responde a este correo con "OK" para publicar.</p>'
    + '<p style="font-size:12px;color:#999;">El recurso será formateado con el estilo de inglesconraices.com automáticamente.</p>'
    + '</div>';

  MailApp.sendEmail({
    to: RES_CONFIG.approverEmail,
    subject: RES_CONFIG.approvalSubjectPrefix + ' "' + title + '" — ' + author,
    body: 'Nuevo recurso: "' + title + '" (' + unit + ')\nID: ' + id + '\n\nResponde "OK" para publicar.',
    htmlBody: htmlBody
  });
}

// ─── TRIGGER 2: Detectar respuesta "OK" y publicar ───────────────────────────

function checkForResourceApprovals() {
  var threads = GmailApp.search('subject:"' + RES_CONFIG.approvalSubjectPrefix + '" from:' + RES_CONFIG.approverEmail + ' is:unread');
  Logger.log('Threads aprobación recursos: ' + threads.length);

  for (var t = 0; t < threads.length; t++) {
    var thread = threads[t];
    var messages = thread.getMessages();

    for (var m = messages.length - 1; m >= 0; m--) {
      var msg = messages[m];
      if (!msg.isUnread()) continue;
      if (extractEmailAddr(msg.getFrom()).toLowerCase() !== RES_CONFIG.approverEmail.toLowerCase()) continue;

      var firstLines = msg.getPlainBody().trim().split('\n').slice(0,5).join(' ').toLowerCase();
      if (firstLines.indexOf('ok') > -1) {
        Logger.log('Aprobación detectada');
        var originalBody = messages[0].getPlainBody();
        var idMatch = originalBody.match(/ID:\s*([a-f0-9-]{36})/);

        if (idMatch) {
          try {
            var result = publishResource(idMatch[1]);
            Logger.log('Publicado: ' + result.title);
            MailApp.sendEmail({
              to: RES_CONFIG.approverEmail,
              subject: '✅ Recurso publicado: "' + result.title + '"',
              body: 'Publicado en: https://inglesconraices.com/recursos/units/' + result.slug + '/\n\nYa aparece en la grilla de recursos.'
            });
          } catch(err) {
            Logger.log('Error: ' + err.message);
            MailApp.sendEmail({
              to: RES_CONFIG.approverEmail,
              subject: '❌ Error al publicar recurso',
              body: 'Error: ' + err.message
            });
          }
        }
      }
      msg.markRead();
      break;
    }
    thread.markRead();
    GmailApp.moveThreadToArchive(thread);
  }
}

// ─── PUBLICAR: formatear, subir a GitHub ─────────────────────────────────────

function publishResource(id) {
  var sheet = getResSheet();
  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === id) { rowIndex = i; break; }
  }
  if (rowIndex === -1) throw new Error('Recurso no encontrado: ' + id);

  var row = data[rowIndex];
  var resource = {
    id:         row[0], date:       row[1], author:     row[2],
    title:      row[3], slug:       row[4], unit:       row[5],
    grade:      row[6], topic:      row[7], activities: row[8],
    status:     row[9]
  };

  if (resource.status === 'publicado') return resource;

  var token = getToken();
  var repo = RES_CONFIG.githubRepo;
  var basePath = 'recursos/units/' + resource.slug;

  // Buscar la carpeta extraída en Drive
  var tempFolder = getOrCreateDriveFolder(RES_CONFIG.driveFolder);
  var slugFolders = tempFolder.getFoldersByName(resource.slug);
  if (!slugFolders.hasNext()) throw new Error('Carpeta del recurso no encontrada en Drive: ' + resource.slug);
  var resFolder = slugFolders.next();

  var files = resFolder.getFiles();
  var hasIndex = false;

  while (files.hasNext()) {
    var file = files.next();
    var fileName = file.getName();
    var filePath = basePath + '/' + fileName;
    var fileBytes = file.getBlob().getBytes();

    // Formatear index.html: reemplazar styles.css + inyectar nav del sitio
    if (fileName === 'index.html') {
      hasIndex = true;
      var html = file.getBlob().getDataAsString('UTF-8');
      html = formatResourceHtml(html, resource);
      fileBytes = Utilities.newBlob(html,'text/html','index.html').getBytes();
    }

    // Subir a GitHub
    var b64 = Utilities.base64Encode(fileBytes);
    commitResFile(token, repo, filePath, b64, 'Add resource file: ' + fileName);
    Logger.log('Subido: ' + filePath);
  }

  if (!hasIndex) throw new Error('El ZIP no contenía index.html');

  // Actualizar units.json
  var unitEntry = {
    slug:       resource.slug,
    title:      resource.title,
    unit:       resource.unit,
    grade:      resource.grade ? parseInt(resource.grade) : null,
    topic:      resource.topic || '',
    activities: resource.activities ? parseInt(resource.activities) : 0,
    author:     resource.author,
    date:       resource.date,
    cover:      null,
    access:     'public'
  };
  updateUnitsJson(token, repo, unitEntry);

  // Marcar como publicado
  sheet.getRange(rowIndex + 1, 10).setValue('publicado');

  // Limpiar carpeta temporal en Drive
  resFolder.setTrashed(true);

  return resource;
}

// ─── Formatear HTML del recurso ──────────────────────────────────────────────

function formatResourceHtml(html, resource) {
  // 1. Reemplazar la referencia al CSS original por resource-theme.css
  html = html.replace(
    /<link[^>]+rel=["']stylesheet["'][^>]+href=["'][^"']*styles\.css["'][^>]*>/gi,
    '<link rel="stylesheet" href="' + RES_CONFIG.resourceThemePath + '">'
  );

  // Si no había link de stylesheet, añadirlo en <head>
  if (html.indexOf(RES_CONFIG.resourceThemePath) === -1) {
    html = html.replace('</head>',
      '<link rel="stylesheet" href="' + RES_CONFIG.resourceThemePath + '">\n</head>'
    );
  }

  // 2. Añadir Google Fonts si no las tiene
  if (html.indexOf('fonts.googleapis.com') === -1) {
    var fontsLink = '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
      + '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
      + '<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">\n';
    html = html.replace('</head>', fontsLink + '</head>');
  }

  // 3. Inyectar barra del sitio después de <body>
  html = html.replace('<body>', '<body>\n' + RES_CONFIG.siteNavHtml);

  // 4. Actualizar el título con el nombre del sitio
  html = html.replace(/<title>([^<]*)<\/title>/i,
    '<title>$1 · Inglés con Raíces</title>'
  );

  // 5. Añadir canonical y meta si no existen
  if (html.indexOf('canonical') === -1) {
    var canonical = '<link rel="canonical" href="https://inglesconraices.com/recursos/units/'
      + resource.slug + '/">\n';
    html = html.replace('</head>', canonical + '</head>');
  }

  return html;
}
