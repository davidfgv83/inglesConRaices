// ─── Blog Publisher · Inglés con Raíces ──────────────────────────────────────
// Este script se ejecuta con un trigger de tiempo (cada 5 min).
// Lee correos con asunto "BLOG:" de remitentes autorizados,
// los guarda como borradores, y envía notificación para aprobación.
//
// SETUP:
// 1. Pega este código en un proyecto de Apps Script nuevo
// 2. Configura las propiedades del script (Settings → Script Properties):
//    - GITHUB_TOKEN: tu Personal Access Token con permiso "repo"
//    - GITHUB_REPO: davidfgv83/inglesConRaices
// 3. Crea un trigger de tiempo: Edit → Triggers → Add → checkForBlogEmails → cada 5 min
// 4. Despliega como Web App (para la aprobación): Deploy → New deployment → Web app
// ──────────────────────────────────────────────────────────────────────────────

// Configuración
const CONFIG = {
  authorizedEmails: [
    'yagonzalezme@educacionbogota.edu.co',
    'andresrgg@gmail.com',
    'davidfgv83@gmail.com'
  ],
  approverEmail: 'davidfgv83@gmail.com',
  githubRepo: 'davidfgv83/inglesConRaices',
  blogPath: 'blog/',
  sheetName: 'Blog-Borradores',
  subjectPrefix: 'BLOG:',
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

/**
 * Ejecuta cada 5 min vía trigger.
 * Busca correos nuevos con asunto "BLOG:" de autores autorizados.
 */
function checkForBlogEmails() {
  const threads = GmailApp.search(`subject:"${CONFIG.subjectPrefix}" is:unread`);

  threads.forEach(thread => {
    const msg = thread.getMessages()[0];
    const from = extractEmail(msg.getFrom());

    if (!CONFIG.authorizedEmails.includes(from.toLowerCase())) {
      // No autorizado — ignorar
      return;
    }

    const subject = msg.getSubject();
    const title = subject.replace(new RegExp(`^${CONFIG.subjectPrefix}\\s*`, 'i'), '').trim();
    const body = msg.getPlainBody();
    const attachments = msg.getAttachments();

    // Detectar categoría del asunto. Formato: "BLOG: [Experiencias] Mi título"
    const catMatch = title.match(/^\[([^\]]+)\]\s*/);
    let category = CONFIG.defaultCategory;
    let categoryLabel = CONFIG.defaultCategoryLabel;
    let cleanTitle = title;

    if (catMatch) {
      const catKey = catMatch[1].toLowerCase().trim();
      if (CONFIG.categories[catKey]) {
        categoryLabel = CONFIG.categories[catKey];
        category = categoryLabel.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      }
      cleanTitle = title.replace(catMatch[0], '').trim();
    }

    // Generar slug
    const slug = cleanTitle
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 60);

    // Guardar borrador en Sheet
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(CONFIG.sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.sheetName);
      sheet.appendRow(['ID', 'Fecha', 'Autor', 'Título', 'Slug', 'Categoría', 'CategoríaLabel', 'Contenido', 'Imágenes', 'Estado']);
      sheet.getRange(1, 1, 1, 10).setFontWeight('bold');
    }

    const id = Utilities.getUuid();
    const date = new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
    const authorName = from.includes('yagonzalez') ? 'Yuly Andrea González' : 'Andrés Ramírez';

    // Guardar imágenes como blobs en Drive (temporalmente)
    const imageNames = [];
    const folder = getOrCreateFolder('blog-images-temp');
    attachments.forEach((att, i) => {
      if (att.getContentType().startsWith('image/')) {
        const ext = att.getContentType().split('/')[1] === 'png' ? '.png' : '.jpg';
        const fileName = `${slug}-${i + 1}${ext}`;
        const file = folder.createFile(att.copyBlob().setName(fileName));
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        imageNames.push(fileName);
      }
    });

    sheet.appendRow([id, date, authorName, cleanTitle, slug, category, categoryLabel, body, imageNames.join(','), 'borrador']);

    // Marcar como leído
    thread.markRead();
    GmailApp.moveThreadToArchive(thread);

    // Notificar al aprobador
    sendApprovalEmail(id, cleanTitle, authorName, date, body.substring(0, 200));
  });
}

/**
 * Envía email al aprobador con link para aprobar.
 */
function sendApprovalEmail(id, title, author, date, excerpt) {
  const approveUrl = ScriptApp.getService().getUrl() + `?action=approve&id=${id}`;

  const html = `
    <div style="font-family:'Segoe UI',sans-serif; max-width:560px; margin:0 auto; padding:24px; border:1px solid #e5e5e5; border-radius:12px;">
      <h2 style="color:#2e6b4f; margin:0 0 12px;">📝 Nuevo post pendiente</h2>
      <p><strong>Título:</strong> ${title}</p>
      <p><strong>Autor:</strong> ${author}</p>
      <p><strong>Fecha:</strong> ${date}</p>
      <p style="color:#555; margin:12px 0; padding:12px; background:#f8f8f6; border-radius:8px;">${excerpt}...</p>
      <a href="${approveUrl}" style="display:inline-block; padding:12px 24px; background:#2e6b4f; color:white; text-decoration:none; border-radius:999px; font-weight:600; margin-top:12px;">✓ Aprobar y publicar</a>
      <p style="font-size:12px; color:#999; margin-top:16px;">Si no quieres publicar este post, simplemente ignora este correo.</p>
    </div>
  `;

  MailApp.sendEmail({
    to: CONFIG.approverEmail,
    subject: `📝 Post pendiente: "${title}" — ${author}`,
    htmlBody: html,
    body: `Nuevo post de ${author}: "${title}"\n\nAprobar: ${approveUrl}`
  });
}

/**
 * GET handler — procesa la aprobación cuando haces clic en el link.
 */
function doGet(e) {
  const action = e.parameter.action;
  const id = e.parameter.id;

  if (action === 'approve' && id) {
    const result = publishPost(id);
    return HtmlService.createHtmlOutput(`
      <div style="font-family:'Segoe UI',sans-serif; text-align:center; padding:60px 20px;">
        <h1 style="color:#2e6b4f;">✓ Post publicado</h1>
        <p style="color:#555; font-size:1.1rem;">${result.title}</p>
        <p style="margin-top:12px;"><a href="https://inglesconraices.com/blog/posts/${result.slug}.html" style="color:#2e6b4f;">Ver el post →</a></p>
      </div>
    `);
  }

  return HtmlService.createHtmlOutput('<p>Blog Publisher activo.</p>');
}

/**
 * Publica el post: genera HTML, sube imágenes a GitHub, actualiza posts.json.
 */
function publishPost(id) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.sheetName);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const rowIndex = data.findIndex(row => row[0] === id);

  if (rowIndex === -1) throw new Error('Post no encontrado');

  const row = data[rowIndex];
  const post = {
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

  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  const repo = CONFIG.githubRepo;

  // 1. Subir imágenes al repo
  const folder = getOrCreateFolder('blog-images-temp');
  post.images.forEach(imgName => {
    const files = folder.getFilesByName(imgName);
    if (files.hasNext()) {
      const file = files.next();
      const content = Utilities.base64Encode(file.getBlob().getBytes());
      commitFile(token, repo, `blog/images/${imgName}`, content, `Add image: ${imgName}`);
    }
  });

  // 2. Generar HTML del post
  const htmlContent = generatePostHtml(post);
  const htmlBase64 = Utilities.base64Encode(Utilities.newBlob(htmlContent).getBytes());
  commitFile(token, repo, `blog/posts/${post.slug}.html`, htmlBase64, `Publish: ${post.title}`);

  // 3. Actualizar posts.json
  updatePostsJson(token, repo, post);

  // 4. Marcar como publicado en la sheet
  sheet.getRange(rowIndex + 1, 10).setValue('publicado');

  // 5. Limpiar imágenes temp del Drive
  post.images.forEach(imgName => {
    const files = folder.getFilesByName(imgName);
    if (files.hasNext()) files.next().setTrashed(true);
  });

  return post;
}

/**
 * Genera el HTML del post a partir del template.
 */
function generatePostHtml(post) {
  // Convertir texto plano a HTML
  let contentHtml = post.content
    .split(/\n\n+/)
    .map(para => {
      para = para.trim();
      if (!para) return '';
      // Si empieza con ## es h2
      if (para.startsWith('## ')) return `<h2>${para.replace('## ', '')}</h2>`;
      if (para.startsWith('### ')) return `<h3>${para.replace('### ', '')}</h3>`;
      return `<p>${para.replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n    ');

  // Insertar primera imagen después del primer párrafo si hay
  if (post.images.length > 0) {
    const firstP = contentHtml.indexOf('</p>');
    if (firstP > -1) {
      const imgTag = `\n    <img src="../images/${post.images[0]}" alt="${post.title}">`;
      contentHtml = contentHtml.substring(0, firstP + 4) + imgTag + contentHtml.substring(firstP + 4);
    }
    // Insertar imágenes adicionales al final
    for (let i = 1; i < post.images.length; i++) {
      contentHtml += `\n    <img src="../images/${post.images[i]}" alt="${post.title}">`;
    }
  }

  const excerpt = post.content.substring(0, 160).replace(/\n/g, ' ').trim();

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${post.title} · Blog · Inglés con Raíces</title>
  <meta name="description" content="${excerpt}">
  <link rel="canonical" href="https://inglesconraices.com/blog/posts/${post.slug}.html">
  <meta property="og:type" content="article">
  <meta property="og:url" content="https://inglesconraices.com/blog/posts/${post.slug}.html">
  <meta property="og:title" content="${post.title}">
  <meta property="og:description" content="${excerpt}">
  ${post.images.length ? `<meta property="og:image" content="https://inglesconraices.com/blog/images/${post.images[0]}">` : ''}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Outfit:wght@300;400;500;600;700&family=Space+Mono:ital@0;1&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../../css/styles.css?v=2">
  <link rel="stylesheet" href="../../css/blog.css?v=1">
</head>
<body>
<nav>
  <a href="../../" class="nav-brand">
    <div class="nav-dot"></div>
    <span class="nav-name">inglesconraices.com</span>
  </a>
  <ul class="nav-links">
    <li><a href="../../#sobre">Sobre nosotros</a></li>
    <li><a href="../../#metodo">Metodología</a></li>
    <li><a href="../" class="nav-link--active">Blog</a></li>
    <li><a href="../../#contacto">Contacto</a></li>
  </ul>
  <a href="../../#contacto" class="nav-cta">Conectemos</a>
</nav>
<article class="post-container">
  <a href="../" class="post-back">← Volver al blog</a>
  <span class="post-category">${post.categoryLabel}</span>
  <h1 class="post-title">${post.title}</h1>
  <p class="post-meta">Por ${post.author} · ${post.date}</p>
  <div class="post-content">
    ${contentHtml}
  </div>
</article>
<footer>
  <span class="footer-brand">Inglés con Raíces · Genre Translanguaging</span>
  <span>© 2026 · Bogotá, Colombia</span>
  <a href="../../">← Inicio</a>
</footer>
</body>
</html>`;
}

/**
 * Actualiza posts.json en el repo añadiendo el nuevo post al inicio.
 */
function updatePostsJson(token, repo, post) {
  const path = 'blog/posts.json';
  let posts = [];
  let sha = null;

  // Leer JSON actual
  try {
    const res = UrlFetchApp.fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      headers: { 'Authorization': `token ${token}` }
    });
    const data = JSON.parse(res.getContentText());
    sha = data.sha;
    posts = JSON.parse(Utilities.newBlob(Utilities.base64Decode(data.content)).getDataAsString());
  } catch (e) {
    // File doesn't exist yet
  }

  const excerpt = post.content.substring(0, 180).replace(/\n/g, ' ').trim() + '...';

  // Añadir al inicio
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

  const content = Utilities.base64Encode(Utilities.newBlob(JSON.stringify(posts, null, 2)).getBytes());

  const payload = {
    message: `Update posts.json: add "${post.title}"`,
    content: content
  };
  if (sha) payload.sha = sha;

  UrlFetchApp.fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${token}`,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload)
  });
}

/**
 * Commit un archivo al repo.
 */
function commitFile(token, repo, path, contentBase64, message) {
  let sha = null;
  try {
    const res = UrlFetchApp.fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      headers: { 'Authorization': `token ${token}` },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) {
      sha = JSON.parse(res.getContentText()).sha;
    }
  } catch (e) {}

  const payload = { message, content: contentBase64 };
  if (sha) payload.sha = sha;

  UrlFetchApp.fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${token}`,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload)
  });
}

/**
 * Obtener o crear carpeta en Drive.
 */
function getOrCreateFolder(name) {
  const folders = DriveApp.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(name);
}

/**
 * Extraer email de un string tipo "Nombre <email@example.com>"
 */
function extractEmail(from) {
  const match = from.match(/<(.+)>/);
  return match ? match[1] : from;
}
