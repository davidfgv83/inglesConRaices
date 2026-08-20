/* ─── Eventos · Inglés con Raíces ─── */

const EVENTS_URL = 'events.json';
const grid    = document.getElementById('eventos-grid');
const totalEl = document.getElementById('total-eventos');

const TYPE_EMOJI = {
  'Taller': '🛠️', 'Conferencia': '🎤', 'Congreso': '🏛️',
  'Webinar': '💻', 'Otro': '📅'
};
const MODALITY_LABEL = {
  'Presencial': 'presencial', 'Virtual': 'virtual', 'Híbrido': 'hibrido'
};

async function loadEventos() {
  try {
    const res = await fetch(EVENTS_URL);
    if (!res.ok) throw new Error('No events');
    const events = await res.json();
    if (totalEl) totalEl.textContent = events.length;
    renderEventos(events);
  } catch {
    grid.innerHTML = '<p class="eventos-empty">Próximamente: nuevos eventos y formaciones.</p>';
    if (totalEl) totalEl.textContent = '0';
  }
}

function renderEventos(events) {
  if (!events.length) {
    grid.innerHTML = '<p class="eventos-empty">Próximamente: nuevos eventos y formaciones.</p>';
    return;
  }

  grid.innerHTML = events.map(ev => {
    const emoji = TYPE_EMOJI[ev.type] || '📅';
    const modalityClass = MODALITY_LABEL[ev.modality] || 'presencial';
    const coverHtml = ev.image
      ? `<img src="images/${ev.image}" alt="${ev.title}" loading="lazy">`
      : `<span class="evento-card-cover-placeholder">${emoji}</span>`;

    // Badge de fecha
    let dayStr = '', monthStr = '';
    if (ev.date) {
      const d = new Date(ev.date + 'T12:00:00');
      dayStr   = d.getDate();
      monthStr = d.toLocaleString('es-CO', { month: 'short' }).replace('.','');
    }

    const speakersHtml = ev.speakers && ev.speakers.length
      ? `<span class="evento-card-speakers">👤 ${ev.speakers.join(' · ')}</span>`
      : '<span></span>';

    const ctaHtml = ev.link
      ? `<a href="${ev.link}" target="_blank" rel="noopener" class="evento-card-cta">Más info →</a>`
      : `<span class="evento-card-cta no-link">Sin registro</span>`;

    return `
      <article class="evento-card">
        <div class="evento-card-cover">
          ${coverHtml}
          <span class="evento-modality-chip ${modalityClass}">${ev.modality || 'Presencial'}</span>
          ${dayStr ? `<div class="evento-date-badge">
            <span class="evento-date-badge-day">${dayStr}</span>
            <span class="evento-date-badge-month">${monthStr}</span>
          </div>` : ''}
        </div>
        <div class="evento-card-body">
          <span class="evento-card-type">${ev.type || 'Evento'}</span>
          <h2 class="evento-card-title">${ev.title}</h2>
          <div class="evento-card-details">
            <div class="evento-card-detail">
              <span class="evento-card-detail-icon">📅</span>
              <span>${ev.dateLabel || ev.date}${ev.time ? ' · ' + ev.time : ''}</span>
            </div>
            <div class="evento-card-detail">
              <span class="evento-card-detail-icon">📍</span>
              <span>${ev.place || '—'}</span>
            </div>
          </div>
          <p class="evento-card-desc">${ev.description || ''}</p>
          <div class="evento-card-footer">
            ${speakersHtml}
            ${ctaHtml}
          </div>
        </div>
      </article>
    `;
  }).join('');
}

loadEventos();
