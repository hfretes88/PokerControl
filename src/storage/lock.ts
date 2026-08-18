/**
 * lock.ts — mutex por clave para operaciones de lectura-modificación-escritura
 * sobre AsyncStorage.
 *
 * AsyncStorage no da atomicidad entre getItem y setItem: si dos operaciones
 * sobre la misma clave se disparan casi al mismo tiempo (p. ej. dos toques
 * rápidos en la UI), ambas pueden leer el mismo estado viejo y la segunda en
 * terminar pisa los cambios de la primera. withLock serializa las funciones
 * que comparten una misma clave para que corran de a una.
 *
 * Es por clave (no global) para no bloquear operaciones sobre claves
 * distintas entre sí, y porque algunas funciones de storage.js llaman a
 * funciones de debts.js sobre otra clave dentro de su propio bloque
 * bloqueado (p. ej. closeSession → generateDebtsFromSession); con locks
 * globales eso generaría un deadlock.
 */

const tails = new Map<string, Promise<void>>();

export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) || Promise.resolve();
  const run = previous.then(fn, fn);
  tails.set(key, run.then(() => undefined, () => undefined));
  return run;
}
