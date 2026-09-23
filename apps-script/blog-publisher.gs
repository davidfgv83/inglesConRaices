// ─── Blog Publisher · Inglés con Raíces ──────────────────────────────────────
// Flujo: Email con BLOG: + [Categoría] → parsea → sube imágenes → genera HTML →
//        publica en GitHub. Sin paso de aprobación. Publicación automática inmediata.
//
// SETUP:
// 1. Script Properties: GITHUB_TOKEN, SHEET_ID
// 2. UN solo trigger de tiempo (cada 5 min): checkForBlogEmails
//
// FORMATO DEL CORREO:
//   Para: genretranslanguaging@gmail.com
//   Asunto: BLOG: [Experiencias] Título del post
//   Cuerpo: contenido del post (texto plano; usa "## " y "### " para encabezados)
//   Adjuntos: imágenes (opcional)
// ──────────────────────────────────────────────────────────────────────────────

var BLOG_CONFIG = {
  authorizedEmails: [
    'yulygonza@gmail.com',
    'jaramirez1971@gmail.com',
    'davidfgv83@gmail.com'
  ],
  notifyEmail:   'davidfgv83@gmail.com',
  githubRepo:    'davidfgv83/inglesConRaices',
  sheetName:     'Blog-Publicados',
  subjectPrefix: 'BLOG:',
  imageFolder:   'blog-images-temp',
  categories: {
    'experiencia':   'Experiencias',
    'experiencias':  'Experiencias',
    'metodologia':   'Metodología',
    'metodología':   'Metodología',
    'publicacion':   'Publicaciones',
    'publicaciones': 'Publicaciones',
    'publicación':   'Publicaciones'
  },
  defaultCategory:      'experiencias',
  defaultCategoryLabel: 'Experiencias'
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getBlogSheet() {
  var sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(BLOG_CONFIG.sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(BLOG_CONFIG.sheetName);
    sheet.appendRow(['ID','Fecha','Autor','Título','Slug','Categoría','CategoríaLabel','Imágenes','Estado']);
    sheet.getRange(1,1,1,9).setFontWeight('bold');
  }
  return sheet;
}

function extractBlogEmailAddr(from) {
  var m = from.match(/<(.+)>/);
  return m ? m[1] : from;
}

function makeBlogSlug(text) {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-|-$/g,'')
    .substring(0,60) || ('post-' + Date.now());
}

function getOrCreateBlogFolder(name) {
  var folders = DriveApp.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(name);
}

function getBlogToken() {
  return PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
}

// ─── Commit a GitHub ─────────────────────────────────────────────────────────

function commitBlogFile(token, repo, path, contentBase64, message) {
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

// ─── Actualizar posts.json ────────────────────────────────────────────────────

function updateBlogPostsJson(token, repo, post) {
  var path = 'blog/posts.json';
  var posts = [];
  var sha = null;
  var maxRetries = 3;

  for (var attempt = 0; attempt < maxRetries; attempt++) {
    posts = []; sha = null;
    try {
      var res = UrlFetchApp.fetch('https://api.github.com/repos/' + repo + '/contents/' + path, {
        headers: { 'Authorization': 'token ' + token },
        muteHttpExceptions: true
      });
      if (res.getResponseCode() === 200) {
        var fd = JSON.parse(res.getContentText());
        sha = fd.sha;
        posts = JSON.parse(Utilities.newBlob(Utilities.base64Decode(fd.content)).getDataAsString());
      }
    } catch(e) {}

    var excerpt = post.content.substring(0, 180).replace(/\n/g, ' ').trim() + '...';

    posts = posts.filter(function(p) { return p.slug !== post.slug; });
    posts.unshift({
      slug:          post.slug,
      title:         post.title,
      excerpt:       excerpt,
      author:        post.author,
      date:          post.date,
      category:      post.category,
      categoryLabel: post.categoryLabel,
      image:         post.images.length > 0 ? post.images[0] : null
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

    var code = putRes.getResponseCode();
    if (code === 200 || code === 201) {
      Logger.log('posts.json actualizado');
      return;
    }
    Logger.log('Intento ' + (attempt+1) + ' falló (' + code + '). Reintentando...');
    Utilities.sleep(2000);
  }
  Logger.log('ERROR: No se pudo actualizar posts.json');
}

// ─── TRIGGER ÚNICO: recibir, procesar y publicar ─────────────────────────────

function checkForBlogEmails() {
  var threads = GmailApp.search('subject:"' + BLOG_CONFIG.subjectPrefix + '" is:unread');
  Logger.log('Threads BLOG: ' + threads.length);

  for (var t = 0; t < threads.length; t++) {
    var thread = threads[t];
    var msg = thread.getMessages()[0];
    var from = extractBlogEmailAddr(msg.getFrom());

    if (BLOG_CONFIG.authorizedEmails.indexOf(from.toLowerCase()) === -1) {
      Logger.log('No autorizado: ' + from);
      thread.markRead();
      continue;
    }

    var subject = msg.getSubject() || '';
    var rawTitle = subject.replace(new RegExp(BLOG_CONFIG.subjectPrefix + '\\s*','i'),'').trim();
    var body = msg.getPlainBody() || '';
    var attachments = msg.getAttachments() || [];

    // Parsear [Categoría] del asunto
    var catMatch = rawTitle.match(/^\[([^\]]+)\]\s*/);
    var category = BLOG_CONFIG.defaultCategory;
    var categoryLabel = BLOG_CONFIG.defaultCategoryLabel;
    var cleanTitle = rawTitle;

    if (catMatch) {
      var catKey = catMatch[1].toLowerCase().trim();
      if (BLOG_CONFIG.categories[catKey]) {
        categoryLabel = BLOG_CONFIG.categories[catKey];
        category = categoryLabel.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      }
      cleanTitle = rawTitle.replace(catMatch[0],'').trim();
    }

    if (!cleanTitle) cleanTitle = rawTitle || 'Post sin título';
    var slug = makeBlogSlug(cleanTitle);
    Logger.log('Título: ' + cleanTitle + ' | Categoría: ' + categoryLabel);

    // Determinar autor
    var authorName = 'David Julián Castaño';
    if (from.toLowerCase().indexOf('yagonzalez') > -1) authorName = 'Dra. Yuly González';
    else if (from.toLowerCase().indexOf('andresrgg') > -1) authorName = 'Dr. Andrés Ramírez';

    var id = Utilities.getUuid();
    var date = new Date().toLocaleDateString('es-CO',{year:'numeric',month:'long',day:'numeric'});

    // Archivar correo inmediatamente
    thread.markRead();
    GmailApp.moveThreadToArchive(thread);

    try {
      // Guardar imágenes adjuntas en Drive temporalmente
      var imageNames = [];
      var folder = getOrCreateBlogFolder(BLOG_CONFIG.imageFolder);
      for (var i = 0; i < attachments.length; i++) {
        var att = attachments[i];
        if (att.getContentType() && att.getContentType().indexOf('image/') === 0) {
          var ext = att.getContentType().indexOf('png') > -1 ? '.png' : '.jpg';
          var fileName = slug + '-' + (i + 1) + ext;
          folder.createFile(att.copyBlob().setName(fileName));
          imageNames.push(fileName);
        }
      }

      var token = getBlogToken();
      var repo = BLOG_CONFIG.githubRepo;

      // Publicar imágenes directamente en GitHub
      for (var j = 0; j < imageNames.length; j++) {
        var imgName = imageNames[j];
        var files = folder.getFilesByName(imgName);
        if (files.hasNext()) {
          var file = files.next();
          var imgB64 = Utilities.base64Encode(file.getBlob().getBytes());
          commitBlogFile(token, repo, 'blog/images/' + imgName, imgB64, 'Add image: ' + imgName);
          Logger.log('Subido: blog/images/' + imgName);
        }
      }

      var post = {
        id:            id,
        date:          date,
        author:        authorName,
        title:         cleanTitle,
        slug:          slug,
        category:      category,
        categoryLabel: categoryLabel,
        content:       body,
        images:        imageNames
      };

      // Generar y publicar HTML del post
      var htmlContent = generateBlogPostHtml(post);
      var htmlB64 = Utilities.base64Encode(Utilities.newBlob(htmlContent, 'text/html', 'post.html').getBytes());
      commitBlogFile(token, repo, 'blog/posts/' + slug + '.html', htmlB64, 'Publish: ' + cleanTitle);
      Logger.log('Subido: blog/posts/' + slug + '.html');

      // Actualizar posts.json
      updateBlogPostsJson(token, repo, post);

      // Registrar en Sheet
      var sheet = getBlogSheet();
      sheet.appendRow([id, date, authorName, cleanTitle, slug, category, categoryLabel, imageNames.join(','), 'publicado']);

      // Limpiar imágenes temporales de Drive
      for (var k = 0; k < imageNames.length; k++) {
        var f2 = folder.getFilesByName(imageNames[k]);
        if (f2.hasNext()) f2.next().setTrashed(true);
      }

      // Notificar éxito
      MailApp.sendEmail({
        to: BLOG_CONFIG.notifyEmail,
        subject: '✅ Post publicado: "' + cleanTitle + '"',
        body: 'El post fue publicado automáticamente.\n\nVer: https://inglesconraices.com/blog/posts/' + slug + '.html\nBlog: https://inglesconraices.com/blog/'
      });
      Logger.log('Publicado: ' + cleanTitle);

    } catch(err) {
      Logger.log('ERROR al publicar: ' + err.message);
      MailApp.sendEmail({
        to: BLOG_CONFIG.notifyEmail,
        subject: '❌ Error al publicar post: "' + cleanTitle + '"',
        body: 'Error: ' + err.message + '\n\nAsunto original: ' + subject
      });
    }
  }
}

// ─── Generar HTML del post ────────────────────────────────────────────────────

function generateBlogPostHtml(post) {
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
    for (var j = 0; j < post.images.length; j++) {
      contentHtml += '<img src="../images/' + post.images[j] + '" alt="' + post.title + '">\n';
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
    + '  <ul class="nav-links" id="nav-links">\n'
    + '    <li><a href="../../#sobre">Sobre nosotros</a></li>\n'
    + '    <li><a href="../../#metodo">Metodología CBS</a></li>\n'
    + '    <li><a href="../" class="nav-link--active">Blog</a></li>\n'
    + '    <li><a href="../../recursos/">Recursos</a></li>\n'
    + '    <li><a href="../../#contacto">Contacto</a></li>\n'
    + '  </ul>\n'
    + '  <div class="nav-right">\n'
    + '    <a href="../../#contacto" class="nav-cta">Conectemos</a>\n'
    + '    <button class="nav-hamburger" id="nav-hamburger" aria-label="Menú" aria-expanded="false">\n'
    + '      <span></span><span></span><span></span>\n'
    + '    </button>\n'
    + '  </div>\n'
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
    + '<script src="../../js/main.js?v=2"></script>\n'
    + '</body>\n</html>';
}
