/* ─── Recursos · Inglés con Raíces ─── */

const UNITS_URL = 'units.json';
const grid    = document.getElementById('recursos-grid');
const filters = document.querySelectorAll('.recursos-filter');
const totalEl = document.getElementById('total-units');
let allUnits  = [];

const GRADE_EMOJI = { '3': '🌱', '4': '🌿', '5': '🌳' };
const COVER_EMOJI = ['📖', '🌍', '🎭', '🏞️', '🎶', '🔬', '🏡', '🌊'];

async function loadUnits() {
  try {
    const res = await fetch(UNITS_URL);
    if (!res.ok) throw new Error('No units');
    allUnits = await res.json();
    totalEl.textContent = allUnits.length;
    renderUnits(allUnits);
  } catch {
    grid.innerHTML = '<p class="recursos-empty">Próximamente: nuevas unidades interactivas.</p>';
    if (totalEl) totalEl.textContent = '0';
  }
}

function renderUnits(units) {
  if (!units.length) {
    grid.innerHTML = '<p class="recursos-empty">No hay unidades en este nivel aún.</p>';
    return;
  }

  grid.innerHTML = units.map((unit, i) => {
    const emoji = COVER_EMOJI[i % COVER_EMOJI.length];
    const gradeLabel = unit.grade ? `${unit.grade}° grado` : '';
    const coverHtml = unit.cover
      ? `<img src="units/${unit.slug}/${unit.cover}" alt="${unit.title}" loading="lazy">`
      : `<span class="unit-card-cover-emoji">${emoji}</span>`;

    return `
      <article class="unit-card" data-grade="${unit.grade || ''}">
        <div class="unit-card-cover">
          ${coverHtml}
          ${gradeLabel ? `<span class="unit-card-grade">${gradeLabel}</span>` : ''}
        </div>
        <div class="unit-card-body">
          <span class="unit-card-unit">${unit.unit || ''}</span>
          <h2 class="unit-card-title">${unit.title}</h2>
          <p class="unit-card-topic">${unit.topic || ''}</p>
          <div class="unit-card-meta">
            <span class="unit-card-activities">${unit.activities ? unit.activities + ' actividades' : ''}</span>
            <a href="units/${unit.slug}/" class="unit-card-cta">Ver actividades →</a>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

// Filtros por grado
filters.forEach(btn => {
  btn.addEventListener('click', () => {
    filters.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const grade = btn.dataset.grade;
    renderUnits(grade === 'all' ? allUnits : allUnits.filter(u => String(u.grade) === grade));
  });
});

loadUnits();
