// A browser stand-in for Node's `events`: the EventEmitter methods the Lighthouse bundle uses.
export class EventEmitter {
  #listeners = new Map();
  on(name, fn) {
    const list = this.#listeners.get(name) ?? [];
    list.push({ fn, once: false });
    this.#listeners.set(name, list);
    return this;
  }
  addListener(name, fn) {
    return this.on(name, fn);
  }
  prependListener(name, fn) {
    const list = this.#listeners.get(name) ?? [];
    list.unshift({ fn, once: false });
    this.#listeners.set(name, list);
    return this;
  }
  once(name, fn) {
    const list = this.#listeners.get(name) ?? [];
    list.push({ fn, once: true });
    this.#listeners.set(name, list);
    return this;
  }
  off(name, fn) {
    const list = this.#listeners.get(name);
    if (list) this.#listeners.set(name, list.filter(l => l.fn !== fn));
    return this;
  }
  removeListener(name, fn) {
    return this.off(name, fn);
  }
  removeAllListeners(name) {
    if (name === undefined) this.#listeners.clear();
    else this.#listeners.delete(name);
    return this;
  }
  emit(name, ...args) {
    const list = this.#listeners.get(name);
    if (!list?.length) return false;
    for (const l of [...list]) {
      if (l.once) this.off(name, l.fn);
      l.fn(...args);
    }
    return true;
  }
  listenerCount(name) {
    return this.#listeners.get(name)?.length ?? 0;
  }
  listeners(name) {
    return (this.#listeners.get(name) ?? []).map(l => l.fn);
  }
  eventNames() {
    return [...this.#listeners.keys()];
  }
  setMaxListeners() {
    return this;
  }
  getMaxListeners() {
    return Infinity;
  }
}
export default EventEmitter;
export const once = (emitter, name) => new Promise(resolve => emitter.once(name, (...args) => resolve(args)));
