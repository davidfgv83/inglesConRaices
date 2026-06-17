/* ─────────────────────────────────────────────
   Genre Translanguaging · Yuly Andrea González
   main.js
   ───────────────────────────────────────────── */

// ─── Configuración ───────────────────────────────────────────────────────────
// Reemplaza con la URL de tu Web App de Google Apps Script.
// Deploy → New deployment → Web app → copia la URL aquí.
const SHEET_URL = 'https://script.google.com/macros/s/AKfycbwVLbvDMTx8RlaGmb1eWHSogVJh0QVOAzea9Y0P529fXvNdREeKsH4dnhtCJKF3tj0g2w/exec';

// ─── Scroll reveal ───────────────────────────────────────────────────────────
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
);

document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));

// ─── Formulario de contacto ──────────────────────────────────────────────────
const form      = document.getElementById('contact-form');
const submitBtn = form.querySelector('.form-submit');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const payload = {
    nombre:      form.nombre.value.trim(),
    institucion: form.institucion.value.trim(),
    email:       form.email.value.trim(),
    mensaje:     form.mensaje.value.trim(),
  };

  if (!payload.nombre || !payload.email || !payload.mensaje) {
    showStatus('error', 'Por favor completa nombre, correo y mensaje.');
    return;
  }

  setLoading(true);

  try {
    await fetch(SHEET_URL, {
      method: 'POST',
      mode:   'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    // Con no-cors la respuesta es opaca, pero el dato llega.
    showStatus('success', '¡Mensaje enviado! Te contactaremos pronto.');
    form.reset();
  } catch {
    showStatus('error', 'Sin conexión. Inténtalo de nuevo.');
  } finally {
    setLoading(false);
  }
});

function setLoading(loading) {
  submitBtn.disabled    = loading;
  submitBtn.textContent = loading ? 'Enviando…' : 'Enviar mensaje';
}

function showStatus(type, message) {
  const prev = form.querySelector('.form-status');
  if (prev) prev.remove();

  const el = document.createElement('p');
  el.className  = `form-status form-status--${type}`;
  el.textContent = message;
  form.appendChild(el);

  if (type === 'success') setTimeout(() => el.remove(), 6000);
}
