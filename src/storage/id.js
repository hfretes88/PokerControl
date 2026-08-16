/**
 * Genera un ID único para entidades locales (jugadores, sesiones, deudas, ajustes).
 * Combina timestamp + sufijo aleatorio para evitar colisiones cuando dos
 * entidades se crean dentro del mismo milisegundo.
 */
export function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Parsea JSON de AsyncStorage de forma segura. Si los datos están
 * corruptos, devuelve el fallback en vez de tirar una excepción.
 */
export function safeParse(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[PokerControl] Datos corruptos en almacenamiento, se ignoran:', err);
    return fallback;
  }
}
