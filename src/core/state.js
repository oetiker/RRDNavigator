const groups = new Map();

function ensure(name) {
  let g = groups.get(name);
  if (!g) {
    g = { listeners: new Set() };
    groups.set(name, g);
  }
  return g;
}

export function getGroup(name) {
  const g = ensure(name);
  // return a snapshot without listeners exposed
  const { listeners: _, ...state } = g;
  return state;
}

export function subscribe(name, fn) {
  const g = ensure(name);
  g.listeners.add(fn);
  return () => {
    g.listeners.delete(fn);
    if (g.listeners.size === 0 && Object.keys(g).length === 1) {
      groups.delete(name);
    }
  };
}

export function update(name, patch, source) {
  const g = ensure(name);
  Object.assign(g, patch);
  const { listeners: _, ...state } = g;
  for (const fn of g.listeners) fn(state, source);
}

export function _reset() {
  groups.clear();
}
