import { renderDashboard } from './pages/dashboard.js';
import { renderGeo } from './pages/geo.js';
import { renderOrder } from './pages/order.js';
import { renderResource } from './pages/resource.js';
import { renderService } from './pages/service.js';

const app = document.querySelector('#app');
const STORAGE_KEY = 'nexus.web.route';

const pages = {
  dashboard: renderDashboard,
  geo: renderGeo,
  resource: renderResource,
  service: renderService,
  order: renderOrder,
};

const normalizeRoute = (route) => (pages[route] ? route : 'dashboard');
const readStoredRoute = () => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};
const writeStoredRoute = (route) => {
  try {
    localStorage.setItem(STORAGE_KEY, route);
  } catch {
    // Ignore storage failures; the app must still render.
  }
};

const render = () => {
  const route = normalizeRoute(location.hash.replace('#/', '') || readStoredRoute() || 'dashboard');
  writeStoredRoute(route);
  if (!app) {
    document.body.innerHTML = '<main style="padding:24px;font-family:system-ui,sans-serif">Nexus web failed to mount: #app not found.</main>';
    return;
  }
  app.innerHTML = pages[route]();

  document.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => {
      const nextRoute = normalizeRoute(el.dataset.route || 'dashboard');
      writeStoredRoute(nextRoute);
      location.hash = `#/${nextRoute}`;
    });
  });
};

window.addEventListener('hashchange', render);
window.addEventListener('error', (event) => {
  const message = event instanceof ErrorEvent ? event.message : 'Unexpected runtime error';
  if (app) {
    app.innerHTML = `<main style="padding:24px;font-family:system-ui,sans-serif"><h1>Nexus failed to load</h1><pre>${message}</pre></main>`;
  }
});
render();
