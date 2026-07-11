// ─── Blog Publisher · Inglés con Raíces ──────────────────────────────────────
// Flujo: Email con "BLOG:" → borrador en Sheet → notificación a aprobador →
//        aprobador responde "OK" → se publica automáticamente en GitHub.
//
// SETUP:
// 1. Pega este código en Apps Script vinculado al Sheet (o standalone con sheetId)
// 2. Script Properties: GITHUB_TOKEN, SHEET_ID
// 3. Crear DOS triggers de tiempo (cada 5 min):
//    - checkForBlogEmails
//    - checkForApprovals
// ──────────────────────────────────────────────────────────────────────────────

const CONFIG = {
  authorizedEmails: [
    'yagonzalezme@educacionbogota.edu.co',
    'andresrgg@gmail.com',
    'davidfgv83@gmail.com'
  ],
  approverEmail: 'davidfgv83@gmail.com',
  githubRepo: 'davidfgv83/inglesConRaices',
  sheetName: 'Blog-Borradores',
  subjectPrefix: 'BLOG:',
  approvalSubjectPrefix: '📝 Post pendiente:',
  categories: {
    'experiencia': 'Experiencias',
    'experiencias': 'Experiencias',
    'metodologia': 'Metodología',
    'metodología': 'Metodología',
    'publicacion': 'Publicaciones',
    'publicaciones': 'Publicaciones',
    'publicación': 'Publicaciones'
  },
  defaultCategory: 'experiencias',
  defaultCategoryLabel: 'Experiencias'
};

function getSheet() {
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  const ss = SpreadsheetApp.openById(sheetId);
  let sheet = ss.getSheetByName(CONFIG.sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.sheetName);
    sheet.appendRow(['ID', 'Fecha', 'Autor', 'Título', 'Slug', 'Categoría', 'CategoríaLabel', 'Contenido', 'Imágenes', 'Estado']);
    sheet.getRange(1, 1, 1, 10).setFontWeight('bold');
  }
  return sheet;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRIGGER 1: Buscar correos nuevos con "BLOG:" y guardar como borrador
// ═══════════════════════════════════════════════════════════════════════════════
function checkForBlogEmails() {
  const threads = GmailApp.search('subject:"' + CONFIG.subjectPrefix + '" is:unread');
  Logger.log('Threads BLOG encontrados: ' + threads.length);

  for (var t = 0; t < threads.length; t++) {
    var thread = threads[t];
    var msg = thread.getMessages()[0];
    var from = extractEmail(msg.getFrom());
    Logger.log('Email de: ' + from);

    if (CONFIG.authorizedEmails.indexOf(from.toLowerCase()) === -1) {
      Logger.log('No autorizado, ignorando');
      continue;
    }

    var subject = msg.getSubject() || '';
    var rawTitle = subject.replace(new RegExp(CONFIG.subjectPrefix + '\\s*', 'i'), '').trim();
    var body = msg.getPlainBody() || '';
    var attachments = msg.getAttachments() || [];

    // Detectar categoría [Experiencias], [Metodología], [Publicaciones]
    var catMatch = rawTitle.match(/^\[([^\]]+)\]\s*/);
    var category = CONFIG.defaultCategory;
    var categoryLabel = CONFIG.defaultCategoryLabel;
    var cleanTitle = rawTitle;

    if (catMatch) {
      var catKey = catMatch[1].toLowerCase().trim();
      if (CONFIG.categories[catKey]) {
        categoryLabel = CONFIG.categories[catKey];
        category = categoryLabel.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      }
      cleanTitle = rawTitle.replace(catMatch[0], '').trim();
    }

    if (!cleanTitle) cleanTitle = rawTitle || 'Post sin título';
    Logger.log('Título: ' + cleanTitle);

    // Slug
    var slug = cleanTitle
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 60) || ('post-' + Date.now());

    // Autor
    var authorName = 'David Julián Castaño';
    if (from.toLowerCase().indexOf('yagonzalez') > -1) {
      authorName = 'Dra. Yuly González';
    } else if (from.toLowerCase().indexOf('andresrgg') > -1) {
      authorName = 'Dr. Andrés Ramírez';
    }

    var id = Utilities.getUuid();
    var date = new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });

    // Guardar imágenes en Drive
    var imageNames = [];
    var folder = getOrCreateFolder('blog-images-temp');
    for (var i = 0; i < attachments.length; i++) {
      var att = attachments[i];
      if (att.getContentType() && att.getContentType().indexOf('image/') === 0) {
        var ext = att.getContentType().indexOf('png') > -1 ? '.png' : '.jpg';
        var fileName = slug + '-' + (i + 1) + ext;
        var file = folder.createFile(att.copyBlob().setName(fileName));
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        imageNames.push(fileName);
      }
    }

    // Guardar en Sheet
    var sheet = getSheet();
    sheet.appendRow([id, date, authorName, cleanTitle, slug, category, categoryLabel, body, imageNames.join(','), 'borrador']);
    Logger.log('Guardado: ' + id);

    // Archivar correo
    thread.markRead();
    GmailApp.moveThreadToArchive(thread);

    // Notificar al aprobador
    var excerpt = body.substring(0, 200).replace(/\n/g, ' ');
    var htmlBody = '<div style="font-family:sans-serif;max-width:560px;padding:24px;border:1px solid #e5e5e5;border-radius:12px;">'
      + '<h2 style="color:#2e6b4f;">📝 Nuevo post pendiente</h2>'
      + '<p><strong>Título:</strong> ' + cleanTitle + '</p>'
      + '<p><strong>Autor:</strong> ' + authorName + '</p>'
      + '<p><strong>Fecha:</strong> ' + date + '</p>'
      + '<p><strong>ID:</strong> <code>' + id + '</code></p>'
      + '<p style="color:#555;padding:12px;background:#f8f8f6;border-radius:8px;">' + excerpt + '...</p>'
      + '<p style="margin-top:16px;font-size:14px;color:#2e6b4f;font-weight:bold;">👉 Responde a este correo con "OK" para publicar.</p>'
      + '<p style="font-size:12px;color:#999;">Si no quieres publicar, simplemente ignora este correo.</p>'
      + '</div>';

    MailApp.sendEmail({
      to: CONFIG.approverEmail,
      subject: CONFIG.approvalSubjectPrefix + ' "' + cleanTitle + '" — ' + authorName,
      body: 'Nuevo post: "' + cleanTitle + '" de ' + authorName + '\nID: ' + id + '\n\nResponde "OK" para publicar.',
      htmlBody: htmlBody
    });

    Logger.log('Notificación enviada');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRIGGER 2: Buscar respuestas "OK" del aprobador y publicar
// ═══════════════════════════════════════════════════════════════════════════════
function checkForApprovals() {
  // Buscar respuestas a correos de aprobación
  var threads = GmailApp.search('subject:"' + CONFIG.approvalSubjectPrefix + '" from:' + CONFIG.approverEmail + ' is:unread');
  Logger.log('Threads de aprobación: ' + threads.length);

  for (var t = 0; t < threads.length; t++) {
    var thread = threads[t];
    var messages = thread.getMessages();

    // Buscar la respuesta más reciente del aprobador
    for (var m = messages.length - 1; m >= 0; m--) {
      var msg = messages[m];
      var msgFrom = extractEmail(msg.getFrom()).toLowerCase();

      if (msgFrom !== CONFIG.approverEmail.toLowerCase()) continue;
      if (!msg.isUnread()) continue;

      var replyBody = msg.getPlainBody().trim().toLowerCase();
      // Buscar "ok" en las primeras líneas (ignorar texto citado)
      var firstLines = replyBody.split('\n').slice(0, 5).join(' ').trim();

      if (firstLines.indexOf('ok') > -1) {
        Logger.log('Aprobación detectada');

        // Extraer el ID del post del hilo original
        var originalMsg = messages[0];
        var originalBody = originalMsg.getPlainBody();
        var idMatch = originalBody.match(/ID:\s*([a-f0-9-]{36})/);

        if (idMatch) {
          var postId = idMatch[1];
          Logger.log('Publicando post: ' + postId);

          try {
            var result = publishPost(postId);
            Logger.log('Publicado: ' + result.title);

            // Responder confirmación
            MailApp.sendEmail({
              to: CONFIG.approverEmail,
              subject: '✅ Publicado: "' + result.title + '"',
              body: 'El post fue publicado con éxito.\n\nVer: https://inglesconraices.com/blog/posts/' + result.slug + '.html'
            });
          } catch (err) {
            Logger.log('Error al publicar: ' + err.message);
            MailApp.sendEmail({
              to: CONFIG.approverEmail,
              subject: '❌ Error al publicar post',
              body: 'Hubo un error: ' + err.message + '\n\nID: ' + postId
            });
          }
        } else {
          Logger.log('No se encontró ID en el hilo');
        }
      }

      msg.markRead();
      break;
    }

    thread.markRead();
    GmailApp.moveThreadToArchive(thread);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLICAR: Genera HTML, sube a GitHub
// ═══════════════════════════════════════════════════════════════════════════════
function publishPost(id) {
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === id) { rowIndex = i; break; }
  }
  if (rowIndex === -1) throw new Error('Post no encontrado con ID: ' + id);

  var row = data[rowIndex];
  var post = {
    id:            row[0],
    date:          row[1],
    author:        row[2],
    title:         row[3],
    slug:          row[4],
    category:      row[5],
    categoryLabel: row[6],
    content:       row[7],
    images:        row[8] ? row[8].split(',') : [],
    status:        row[9]
  };

  if (post.status === 'publicado') return post;

  var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  var repo = CONFIG.githubRepo;

  // Subir imágenes
  var folder = getOrCreateFolder('blog-images-temp');
  for (var i = 0; i < post.images.length; i++) {
    var imgName = post.images[i];
    var files = folder.getFilesByName(imgName);
    if (files.hasNext()) {
      var file = files.next();
      var content = Utilities.base64Encode(file.getBlob().getBytes());
      commitFile(token, repo, 'blog/images/' + imgName, content, 'Add image: ' + imgName);
    }
  }

  // Generar y subir HTML
  var htmlContent = generatePostHtml(post);
  var htmlBase64 = Utilities.base64Encode(Utilities.newBlob(htmlContent, 'text/html', 'post.html').getBytes());
  commitFile(token, repo, 'blog/posts/' + post.slug + '.html', htmlBase64, 'Publish: ' + post.title);

  // Actualizar posts.json
  updatePostsJson(token, repo, post);

  // Marcar como publicado
  sheet.getRange(rowIndex + 1, 10).setValue('publicado');

  // Limpiar imágenes temporales
  for (var i = 0; i < post.images.length; i++) {
    var files2 = folder.getFilesByName(post.images[i]);
    if (files2.hasNext()) files2.next().setTrashed(true);
  }

  return post;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GENERAR HTML DEL POST
// ═══════════════════════════════════════════════════════════════════════════════
function generatePostHtml(post) {
  var paragraphs = post.content.split(/\n\n+/);
  var contentHtml = '';

  for (var i = 0; i < paragraphs.length; i++) {
    var para = paragraphs[i].trim();
    if (!para) continue;
    if (para.indexOf('## ') === 0) {
      contentHtml += '<h2>' + para.replace('## ', '') + '</h2>\n';
    } else if (para.indexOf('### ') === 0) {
      contentHtml += '<h3>' + para.replace('### ', '') + '</h3>\n';
    } else {
      contentHtml += '<p>' + para.replace(/\n/g, '<br>') + '</p>\n';
    }
  }

  // Insertar imágenes
  if (post.images.length > 0) {
    for (var i = 0; i < post.images.length; i++) {
      contentHtml += '<img src="../images/' + post.images[i] + '" alt="' + post.title + '">\n';
    }
  }

  var excerpt = post.content.substring(0, 160).replace(/\n/g, ' ').trim();

  return '<!DOCTYPE html>\n'
    + '<html lang="es">\n<head>\n'
    + '<meta charset="UTF-8">\n'
    + '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
    + '<title>' + post.title + ' · Blog · Inglés con Raíces</title>\n'
    + '<meta name="description" content="' + excerpt + '">\n'
    + '<link rel="canonical" href="https://inglesconraices.com/blog/posts/' + post.slug + '.html">\n'
    + '<meta property="og:type" content="article">\n'
    + '<meta property="og:title" content="' + post.title + '">\n'
    + '<meta property="og:description" content="' + excerpt + '">\n'
    + (post.images.length > 0 ? '<meta property="og:image" content="https://inglesconraices.com/blog/images/' + post.images[0] + '">\n' : '')
    + '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
    + '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
    + '<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Outfit:wght@300;400;500;600;700&family=Space+Mono:ital@0;1&display=swap" rel="stylesheet">\n'
    + '<link rel="stylesheet" href="../../css/styles.css?v=2">\n'
    + '<link rel="stylesheet" href="../../css/blog.css?v=1">\n'
    + '</head>\n<body>\n'
    + '<nav>\n'
    + '  <a href="../../" class="nav-brand"><div class="nav-dot"></div><span class="nav-name">inglesconraices.com</span></a>\n'
    + '  <ul class="nav-links">\n'
    + '    <li><a href="../../#sobre">Sobre nosotros</a></li>\n'
    + '    <li><a href="../../#metodo">Metodología</a></li>\n'
    + '    <li><a href="../" class="nav-link--active">Blog</a></li>\n'
    + '    <li><a href="../../#contacto">Contacto</a></li>\n'
    + '  </ul>\n'
    + '  <a href="../../#contacto" class="nav-cta">Conectemos</a>\n'
    + '</nav>\n'
    + '<article class="post-container">\n'
    + '  <a href="../" class="post-back">← Volver al blog</a>\n'
    + '  <span class="post-category">' + post.categoryLabel + '</span>\n'
    + '  <h1 class="post-title">' + post.title + '</h1>\n'
    + '  <p class="post-meta">Por ' + post.author + ' · ' + post.date + '</p>\n'
    + '  <div class="post-content">\n' + contentHtml + '  </div>\n'
    + '</article>\n'
    + '<footer>\n'
    + '  <span class="footer-brand">Inglés con Raíces · Genre Translanguaging</span>\n'
    + '  <span>© 2026 · Bogotá, Colombia</span>\n'
    + '  <a href="../../">← Inicio</a>\n'
    + '</footer>\n'
    + '</body>\n</html>';
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTUALIZAR posts.json
// ═══════════════════════════════════════════════════════════════════════════════
function updatePostsJson(token, repo, post) {
  var path = 'blog/posts.json';
  var maxRetries = 3;

  for (var attempt = 0; attempt < maxRetries; attempt++) {
    var posts = [];
    var sha = null;

    try {
      var res = UrlFetchApp.fetch('https://api.github.com/repos/' + repo + '/contents/' + path, {
        headers: { 'Authorization': 'token ' + token },
        muteHttpExceptions: true
      });
      if (res.getResponseCode() === 200) {
        var fileData = JSON.parse(res.getContentText());
        sha = fileData.sha;
        var decoded = Utilities.newBlob(Utilities.base64Decode(fileData.content)).getDataAsString();
        posts = JSON.parse(decoded);
      }
    } catch (e) {
      Logger.log('posts.json no existe aún, se creará');
    }

    var excerpt = post.content.substring(0, 180).replace(/\n/g, ' ').trim() + '...';

    // Evitar duplicados
    posts = posts.filter(function(p) { return p.slug !== post.slug; });

    posts.unshift({
      slug: post.slug,
      title: post.title,
      excerpt: excerpt,
      author: post.author,
      date: post.date,
      category: post.category,
      categoryLabel: post.categoryLabel,
      image: post.images.length > 0 ? post.images[0] : null
    });

    var content = Utilities.base64Encode(Utilities.newBlob(JSON.stringify(posts, null, 2)).getBytes());
    var payload = { message: 'Update posts.json: add "' + post.title + '"', content: content };
    if (sha) payload.sha = sha;

    var putRes = UrlFetchApp.fetch('https://api.github.com/repos/' + repo + '/contents/' + path, {
      method: 'PUT',
      headers: { 'Authorization': 'token ' + token, 'Content-Type': 'application/json' },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    if (putRes.getResponseCode() === 200 || putRes.getResponseCode() === 201) {
      Logger.log('posts.json actualizado correctamente');
      return;
    }

    Logger.log('Intento ' + (attempt + 1) + ' falló con código ' + putRes.getResponseCode() + '. Reintentando...');
    Utilities.sleep(2000);
  }

  Logger.log('ERROR: No se pudo actualizar posts.json después de ' + maxRetries + ' intentos');
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════════════════════════════════════════════════
function commitFile(token, repo, path, contentBase64, message) {
  var sha = null;
  try {
    var res = UrlFetchApp.fetch('https://api.github.com/repos/' + repo + '/contents/' + path, {
      headers: { 'Authorization': 'token ' + token },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) {
      sha = JSON.parse(res.getContentText()).sha;
    }
  } catch (e) {}

  var payload = { message: message, content: contentBase64 };
  if (sha) payload.sha = sha;

  UrlFetchApp.fetch('https://api.github.com/repos/' + repo + '/contents/' + path, {
    method: 'PUT',
    headers: { 'Authorization': 'token ' + token, 'Content-Type': 'application/json' },
    payload: JSON.stringify(payload)
  });
}

function getOrCreateFolder(name) {
  var folders = DriveApp.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(name);
}

function extractEmail(from) {
  var match = from.match(/<(.+)>/);
  return match ? match[1] : from;
}
