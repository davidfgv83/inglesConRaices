// ─── Resource Publisher · Inglés con Raíces ──────────────────────────────────
// Flujo: Email con RECURSO: + .zip → extrae → formatea → sube a GitHub → live.
// Sin paso de aprobación. Publicación automática inmediata.
//
// SETUP:
// 1. Script Properties: GITHUB_TOKEN, SHEET_ID
// 2. UN solo trigger de tiempo (cada 5 min): checkForResourceEmails
//
// FORMATO DEL CORREO:
//   Para: genretranslanguaging@gmail.com
//   Asunto: RECURSO: [Unidad 1 · 4° Grado] Nombre del recurso
//   Adjunto: archivo.zip  (debe contener index.html + styles.css + script.js)
// ──────────────────────────────────────────────────────────────────────────────

var RES_CONFIG = {
  authorizedEmails: [
    'yagonzalezme@educacionbogota.edu.co',
    'andresrgg@gmail.com',
    'davidfgv83@gmail.com'
  ],
  notifyEmail:       'davidfgv83@gmail.com',
  githubRepo:        'davidfgv83/inglesConRaices',
  sheetName:         'Recursos-Publicados',
  subjectPrefix:     'RECURSO:',
  driveFolder:       'recursos-temp',
  resourceThemePath: '../../css/resource-theme.css',
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
    sheet.appendRow(['ID','Fecha','Autor','Título','Slug','Unidad','Grado','Actividades','Estado']);
    sheet.getRange(1,1,1,9).setFontWeight('bold');
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
    Logger.log('GitHub error ' + code + ' para ' + path);
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

// ─── TRIGGER ÚNICO: recibir, procesar y publicar ─────────────────────────────

function checkForResourceEmails() {
  var threads = GmailApp.search('subject:"' + RES_CONFIG.subjectPrefix + '" is:unread');
  Logger.log('Threads RECURSO: ' + threads.length);

  for (var t = 0; t < threads.length; t++) {
    var thread = threads[t];
    var msg = thread.getMessages()[0];
    var from = extractEmailAddr(msg.getFrom());

    if (RES_CONFIG.authorizedEmails.indexOf(from.toLowerCase()) === -1) {
      Logger.log('No autorizado: ' + from);
      thread.markRead();
      continue;
    }

    var subject = msg.getSubject() || '';
    var rawMeta = subject.replace(new RegExp(RES_CONFIG.subjectPrefix + '\\s*','i'),'').trim();

    // Parsear [Unidad N · X° Grado] del asunto
    var metaMatch = rawMeta.match(/^\[([^\]]+)\]\s*/);
    var unit = 'Unidad 1';
    var grade = '';
    var cleanTitle = rawMeta;

    if (metaMatch) {
      var metaStr = metaMatch[1];
      cleanTitle = rawMeta.replace(metaMatch[0],'').trim();
      var unitMatch = metaStr.match(/[Uu]nidad\s*(\d+)/);
      if (unitMatch) unit = 'Unidad ' + unitMatch[1];
      var gradeMatch = metaStr.match(/(\d)[°º]?\s*[Gg]rado?/) || metaStr.match(/(\d)(?:st|nd|rd|th)/);
      if (gradeMatch) grade = gradeMatch[1];
    }

    if (!cleanTitle) cleanTitle = rawMeta || 'Recurso sin título';
    var slug = makeSlug(cleanTitle);
    Logger.log('Título: ' + cleanTitle + ' | Unidad: ' + unit + ' | Grado: ' + grade);

    // Determinar autor
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

    // Archivar correo inmediatamente
    thread.markRead();
    GmailApp.moveThreadToArchive(thread);

    try {
      // Extraer ZIP
      var tempFolder = getOrCreateDriveFolder(RES_CONFIG.driveFolder);
      var zipBlob = zipAtt.copyBlob();
      var unzipped = Utilities.unzip(zipBlob);
      Logger.log('Archivos en ZIP: ' + unzipped.length);

      // Crear carpeta temporal en Drive
      var extractFolder = tempFolder.createFolder(slug);
      var activityCount = 0;

      for (var i = 0; i < unzipped.length; i++) {
        var blob = unzipped[i];
        var name = blob.getName();
        if (!name || name.endsWith('/') || name.indexOf('__MACOSX') > -1 || name.indexOf('.DS_Store') > -1) continue;
        var flatName = name.split('/').pop();
        if (!flatName) continue;
        extractFolder.createFile(blob.setName(flatName));
        Logger.log('Extraído: ' + flatName);
      }

      // Publicar directamente
      var token = getToken();
      var repo = RES_CONFIG.githubRepo;
      var basePath = 'recursos/units/' + slug;
      var hasIndex = false;

      var files = extractFolder.getFiles();
      while (files.hasNext()) {
        var file = files.next();
        var fileName = file.getName();
        var fileBytes = file.getBlob().getBytes();

        if (fileName === 'index.html') {
          hasIndex = true;
          var html = file.getBlob().getDataAsString('UTF-8');
          // Contar actividades
          var matches = html.match(/data-game=/g);
          activityCount = matches ? matches.length : 0;
          html = formatResourceHtml(html);
          fileBytes = Utilities.newBlob(html,'text/html','index.html').getBytes();
        }

        var b64 = Utilities.base64Encode(fileBytes);
        commitResFile(token, repo, basePath + '/' + fileName, b64, 'Add resource: ' + fileName);
        Logger.log('Subido: ' + basePath + '/' + fileName);
      }

      if (!hasIndex) throw new Error('El ZIP no contenía index.html');

      // Actualizar units.json
      var unitEntry = {
        slug:       slug,
        title:      cleanTitle,
        unit:       unit,
        grade:      grade ? parseInt(grade) : null,
        topic:      '',
        activities: activityCount,
        author:     authorName,
        date:       date,
        cover:      null,
        access:     'public'
      };
      updateUnitsJson(token, repo, unitEntry);

      // Registrar en Sheet
      var sheet = getResSheet();
      sheet.appendRow([id, date, authorName, cleanTitle, slug, unit, grade, activityCount, 'publicado']);

      // Limpiar Drive
      extractFolder.setTrashed(true);

      // Notificar éxito
      MailApp.sendEmail({
        to: RES_CONFIG.notifyEmail,
        subject: '✅ Recurso publicado: "' + cleanTitle + '"',
        body: 'El recurso fue publicado automáticamente.\n\nVer: https://inglesconraices.com/recursos/units/' + slug + '/\nGridla: https://inglesconraices.com/recursos/'
      });
      Logger.log('Publicado: ' + cleanTitle);

    } catch(err) {
      Logger.log('ERROR al publicar: ' + err.message);
      MailApp.sendEmail({
        to: RES_CONFIG.notifyEmail,
        subject: '❌ Error al publicar recurso: "' + cleanTitle + '"',
        body: 'Error: ' + err.message + '\n\nAsunto original: ' + subject
      });
    }
  }
}

// ─── Formatear HTML del recurso ──────────────────────────────────────────────

function formatResourceHtml(html) {
  // Reemplazar CSS original por resource-theme.css
  html = html.replace(
    /<link[^>]+rel=["']stylesheet["'][^>]+href=["'][^"']*styles\.css["'][^>]*>/gi,
    '<link rel="stylesheet" href="' + RES_CONFIG.resourceThemePath + '">'
  );
  if (html.indexOf(RES_CONFIG.resourceThemePath) === -1) {
    html = html.replace('</head>',
      '<link rel="stylesheet" href="' + RES_CONFIG.resourceThemePath + '">\n</head>'
    );
  }

  // Google Fonts si no las tiene
  if (html.indexOf('fonts.googleapis.com') === -1) {
    var fonts = '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
      + '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
      + '<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">\n';
    html = html.replace('</head>', fonts + '</head>');
  }

  // Inyectar barra del sitio al inicio del body
  html = html.replace('<body>', '<body>\n' + RES_CONFIG.siteNavHtml);

  // Añadir " · Inglés con Raíces" al título
  html = html.replace(/<title>([^<]*)<\/title>/i, '<title>$1 · Inglés con Raíces</title>');

  return html;
}
