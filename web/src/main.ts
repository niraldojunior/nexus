import { renderDashboard } from './pages/dashboard';
import { renderGeo } from './pages/geo';
import { renderOrder } from './pages/order';
import { renderResource } from './pages/resource';
import { renderService } from './pages/service';

const app = document.querySelector<HTMLDivElement>('#app');
const STORAGE_KEY = 'nexus.web.route';
const SIDEBAR_KEY = 'nexus.web.sidebar';

const pages: Record<string, () => string> = {
  dashboard: renderDashboard,
  geo: renderGeo,
  resource: renderResource,
  service: renderService,
  order: renderOrder,
  chat: renderGeo,
};

const normalizeRoute = (route: string) => (pages[route] ? route : 'dashboard');
const readStoredRoute = () => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

const writeStoredRoute = (route: string) => {
  try {
    localStorage.setItem(STORAGE_KEY, route);
  } catch {
    // Ignore storage failures; the app must still render.
  }
};
const readSidebarState = () => {
  try {
    return localStorage.getItem(SIDEBAR_KEY) || 'expanded';
  } catch {
    return 'expanded';
  }
};
const writeSidebarState = (state: string) => {
  try {
    localStorage.setItem(SIDEBAR_KEY, state);
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
  const shell = app.firstElementChild as HTMLElement | null;
  if (shell) shell.dataset.sidebarState = readSidebarState();

  document.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => {
      const nextRoute = normalizeRoute((el as HTMLElement).dataset.route || 'dashboard');
      if ((el as HTMLButtonElement).hasAttribute('disabled')) return;
      writeStoredRoute(nextRoute);
      location.hash = `#/${nextRoute}`;
    });
  });

  document.querySelectorAll('[data-sidebar-toggle]').forEach((el) => {
    el.addEventListener('click', () => {
      const next = app.firstElementChild as HTMLElement | null;
      if (!next) return;
      next.dataset.sidebarState = next.dataset.sidebarState === 'collapsed' ? 'expanded' : 'collapsed';
      writeSidebarState(next.dataset.sidebarState);
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
