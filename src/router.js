const CONSTRUCTION_TOKEN = Symbol('router-construction-token');

export class Router {
  constructor({ target, routes }, token) {
    if (token !== CONSTRUCTION_TOKEN) throw new Error('Router must be created with Router.fromObject().');
    this.target = target;
    this.routes = routes;
    this.currentRoute = null;
  }

  static fromObject({ target, routes }) {
    return new Router({ target, routes }, CONSTRUCTION_TOKEN);
  }

  navigate(name, context = {}) {
    const route = this.routes[name];
    if (!route) throw new Error(`Unknown route: ${name}`);
    if (this.currentRoute && typeof this.currentRoute.destroy === 'function') this.currentRoute.destroy();
    this.target.replaceChildren();
    this.currentRoute = route.fromObject({ target: this.target, ...context });
    this.currentRoute.render();
  }
}
