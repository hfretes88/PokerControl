/**
 * chartColors.ts — colores de los gráficos de reportes.
 *
 * Paleta categórica de 8 colores en orden fijo (el orden es lo que la hace
 * distinguible con daltonismo entre colores vecinos). Validada contra el
 * fondo de las tarjetas: oscuro #0e1e35 y claro #c3e0f7. Cada jugador tiene
 * siempre el mismo color (RacePlayer.slot); del noveno en adelante, gris.
 * El verde va último porque al lado del aqua se confunde en las líneas.
 *
 * El mapa de calor usa azul (ganó) ↔ rojo (perdió) con gris en el medio, en
 * vez de verde/rojo, que con daltonismo se confunden.
 */

export interface ChartColors {
  series: string[];
  other: string;
  positive: string;
  negative: string;
  neutral: string;
  grid: string;
  axis: string;
}

const dark: ChartColors = {
  series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9', '#e66767', '#008300'],
  other: '#6b8cad',
  positive: '#3987e5',
  negative: '#e66767',
  neutral: '#3d4452',
  grid: '#1a3058',
  axis: '#2a4a78',
};

const light: ChartColors = {
  series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#6250d6', '#e34948', '#008300'],
  other: '#5b7291',
  positive: '#1c5cab',
  negative: '#c62f2f',
  neutral: '#e6eef7',
  grid: '#9cc7e8',
  axis: '#7aa9d2',
};

export function chartColors(isDark: boolean): ChartColors {
  return isDark ? dark : light;
}

export function seriesColor(colors: ChartColors, slot: number): string {
  return colors.series[slot] ?? colors.other;
}

export function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

/** Mezcla lineal entre dos colores hex (t = 0 → a, t = 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const c = ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
  return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Color de una celda del mapa de calor. La intensidad va en 4 escalones
 * según |valor| / máximo, así se lee mejor que un degradé continuo.
 */
export function divergingColor(colors: ChartColors, value: number, maxAbs: number): string {
  if (value === 0 || maxAbs === 0) return colors.neutral;
  const step = Math.min(4, Math.ceil((Math.abs(value) / maxAbs) * 4));
  // Escalones 40/60/80/100%: el más suave ya se distingue del gris del medio.
  return mix(colors.neutral, value > 0 ? colors.positive : colors.negative, 0.2 + step * 0.2);
}
