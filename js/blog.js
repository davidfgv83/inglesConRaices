/* ─── Blog · Inglés con Raíces ─── */

const POSTS_URL = '../blog/posts.json';
const grid = document.getElementById('blog-grid');
const filters = document.querySelectorAll('.blog-filter');
let allPosts = [];

// Cargar posts
async function loadPosts() {
  try {
    const res = await fetch(POSTS_URL);
    if (!res.ok) throw new Error('No posts yet');
    allPosts = await res.json();
    renderPosts(allPosts);
  } catch {
    grid.innerHTML = '<p class="blog-empty">Próximamente: nuevas historias desde el aula.</p>';
  }
}

// Renderizar cards
function renderPosts(posts) {
  if (!posts.length) {
    grid.innerHTML = '<p class="blog-empty">No hay posts en esta categoría aún.</p>';
    return;
  }

  grid.innerHTML = posts.map(post => `
    <article class="blog-card" data-category="${post.category}">
      ${post.image ? `
      <div class="blog-card-image">
        <a href="posts/${post.slug}.html">
          <img src="images/${post.image}" alt="${post.title}" loading="lazy">
        </a>
      </div>` : ''}
      <div class="blog-card-body">
        <span class="blog-card-category">${post.categoryLabel}</span>
        <h2 class="blog-card-title"><a href="posts/${post.slug}.html">${post.title}</a></h2>
        <p class="blog-card-excerpt">${post.excerpt}</p>
        <div class="blog-card-meta">
          <span class="blog-card-author">${post.author}</span>
          <span class="blog-card-date">${post.date}</span>
        </div>
      </div>
    </article>
  `).join('');
}

// Filtros
filters.forEach(btn => {
  btn.addEventListener('click', () => {
    filters.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const cat = btn.dataset.category;
    if (cat === 'all') {
      renderPosts(allPosts);
    } else {
      renderPosts(allPosts.filter(p => p.category === cat));
    }
  });
});

loadPosts();
