'use strict';
/* ============================================================================
   RB — tiny module registry. This is the ONE intentional namespace; there are
   no other shared globals. Each file calls RB.define('name', factory). A
   factory's closure holds that module's PRIVATE state/helpers and returns only
   its PUBLIC api. A module reaches another module exclusively through a function
   call: require('other').publicMethod(...). Nothing reads another file's
   internals directly.

   require() is lazy + memoized, so modules may depend on each other in cycles
   as long as the access happens at call time (inside a method), not while the
   factory is still building. Acyclic data modules (config/helpers/save) are
   safe to require at the top of a factory.
============================================================================ */
window.RB = (function () {
  const factories = {}, built = {}, building = {};
  function define(name, factory) {
    if (factories[name]) throw new Error('Duplicate module: ' + name);
    factories[name] = factory;
  }
  function require(name) {
    if (built[name]) return built[name];
    const f = factories[name];
    if (!f) throw new Error('Unknown module: ' + name);
    if (building[name]) throw new Error('Build-time cycle on "' + name +
      '": require it lazily inside a method instead of at factory top.');
    building[name] = true;
    const api = f(require);
    delete building[name];
    return (built[name] = api || {});
  }
  return { define, require };
})();
