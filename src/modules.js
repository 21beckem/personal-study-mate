/**
 * EventEmitterMixin(BaseClass)
 *
 * Adds `on`, `off`, `one`, and `emit` methods to a class via mixin composition.
 * Listener storage is kept in a module-private WeakMap, keyed by instance,
 * so it is NOT accessible as a property on the instance or on any subclass
 * (no `this._listeners`, no prototype field — nothing to inspect or override).
 *
 * Usage:
 *   class Foo extends EventEmitterMixin(Base) {}
 *   const foo = new Foo();
 *   foo.on('greet', (name) => console.log(`Hello, ${name}`));
 *   foo.emit('greet', 'world');
 */
export function EventEmitterMixin(BaseClass) {
  if (typeof BaseClass !== 'function') {
    throw new TypeError('EventEmitterMixin expects a class/constructor function as its argument.');
  }

  // Instance -> Map<eventName, Set<listenerFn>>
  // Private to this closure; unreachable from instances or subclasses.
  const registry = new WeakMap();

  function getListenersForInstance(instance, createIfMissing) {
    let listeners = registry.get(instance);
    if (!listeners && createIfMissing) {
      listeners = new Map();
      registry.set(instance, listeners);
    }
    return listeners;
  }

  function assertValidEventName(eventName) {
    if (typeof eventName !== 'string') {
      throw new TypeError(`Event name must be a string. Received: ${typeof eventName}`);
    }
    if (eventName.length === 0) {
      throw new TypeError('Event name must not be an empty string.');
    }
  }

  function assertValidListener(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError(`Listener must be a function. Received: ${typeof listener}`);
    }
  }

  return class EventEmitterExtended extends BaseClass {
    /**
     * Registers a listener for an event. Returns `this` for chaining.
     */
    on(eventName, listener) {
      assertValidEventName(eventName);
      assertValidListener(listener);

      const listeners = getListenersForInstance(this, true);
      if (!listeners.has(eventName)) {
        listeners.set(eventName, new Set());
      }
      listeners.get(eventName).add(listener);
      return this;
    }

    /**
     * Removes a previously registered listener (including ones registered
     * via `one`, since the internal wrapper tracks its original function).
     * Returns `this` for chaining.
     */
    off(eventName, listener) {
      assertValidEventName(eventName);
      assertValidListener(listener);

      const listeners = getListenersForInstance(this, false);
      if (!listeners) return this;

      const eventSet = listeners.get(eventName);
      if (!eventSet) return this;

      for (const registered of eventSet) {
        if (registered === listener || registered.__originalListener === listener) {
          eventSet.delete(registered);
        }
      }

      if (eventSet.size === 0) {
        listeners.delete(eventName);
      }
      return this;
    }

    /**
     * Registers a listener that automatically removes itself after firing
     * once. Returns `this` for chaining.
     */
    one(eventName, listener) {
      assertValidEventName(eventName);
      assertValidListener(listener);

      const wrapper = (...args) => {
        this.off(eventName, wrapper);
        listener.apply(this, args);
      };
      // Tag the wrapper so off(eventName, originalListener) can still find it.
      wrapper.__originalListener = listener;

      this.on(eventName, wrapper);
      return this;
    }

    /**
     * Synchronously invokes all listeners registered for `eventName`,
     * passing along any number of additional arguments. Returns `true`
     * if there were listeners invoked, `false` otherwise.
     */
    emit(eventName, ...args) {
      assertValidEventName(eventName);

      const listeners = getListenersForInstance(this, false);
      if (!listeners) return false;

      const eventSet = listeners.get(eventName);
      if (!eventSet || eventSet.size === 0) return false;

      // Snapshot before iterating: a `one` listener (or a listener that
      // calls `off`/`on` mid-emit) must not corrupt iteration.
      for (const registered of [...eventSet]) {
        registered.apply(this, args);
      }
      return true;
    }

    destroy() {
      const listeners = getListenersForInstance(this, false);
      if (listeners) {
        listeners.clear();
        registry.delete(this);
      }

      if (typeof super.destroy === 'function')
        super.destroy();
    }
  };
}


export class DOMElement {
  #node = null;
  #isDestroyed = false;
  #domListenerMap = new Map();
  constructor() {}
  destroy() {
    if (this.#isDestroyed) return;
    this.#isDestroyed = true;
    this.#removeAllDOMEventListeners();
    if (this.#node) this.#node.remove();
    this.#node = null;
  }
  reset() {
    if (this.#isDestroyed) throw new Error('Cannot reset destroyed DOMElement.');
    this.#removeAllDOMEventListeners();
    if (this.#node) this.#node.remove();
    this.#node = null;
  }
  #removeAllDOMEventListeners() {
    if (this.#domListenerMap.size > 0) {
      for (const [type, listeners] of this.#domListenerMap.entries()) {
        for (const {element, listener} of listeners) {
          element.removeEventListener(type, listener);
        }
      }
      this.#domListenerMap.clear();
    }
  }
  addDOMEventListener(element, type, listener, options) {
    if (this.#isDestroyed) throw new Error('Cannot add event listener to destroyed DOMElement.');
    if (!(element instanceof Node)) throw new TypeError('element must be an instance of Node.');
    if (typeof type !== 'string') throw new TypeError('Event type must be a string.');
    if (typeof listener !== 'function') throw new TypeError('Listener must be a function.');
    if (!this.#domListenerMap.has(type)) this.#domListenerMap.set(type, new Set());

    this.#domListenerMap.get(type).add({listener, element});
    element.addEventListener(type, listener, options);
  }
  get isDestroyed() { return this.#isDestroyed; }
  get node() { return this.#node; }
  set node(v) {
    if(!(v instanceof Node))
      throw new TypeError('node must be an instance of Node.');
    if (this.#node) this.#node.remove();
    this.#node = v;
  }
}
