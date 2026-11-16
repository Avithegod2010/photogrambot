// First module evaluated by the JS bundle: records the cold-start origin
// before any screen/DB module is loaded. No imports on purpose.
(globalThis as any).__pbStart = (globalThis as any).__pbStart ?? Date.now();
