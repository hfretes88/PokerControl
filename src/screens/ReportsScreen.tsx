import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { getReports } from '../storage/reports';
import type { Reports, PlayerReport, CountBucket } from '../storage/reports';
import { Card, formatMoney } from '../components/UI';
import type { Colors } from '../components/UI';
import { createGlobalStyles } from '../components/GlobalStyles';
import { useTheme } from '../theme/ThemeContext';
import type { ScreenProps } from '../navigation/types';

type Tab = 'compras' | 'remontadas' | 'rendimiento' | 'partidas' | 'deudas' | 'temporadas';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'compras', label: '🪙 Compras' },
  { key: 'remontadas', label: '📈 Remontadas' },
  { key: 'rendimiento', label: '🎯 Rendimiento' },
  { key: 'partidas', label: '🃏 Partidas' },
  { key: 'deudas', label: '💳 Deudas' },
  { key: 'temporadas', label: '🗓️ Temporadas' },
];

const TOP_N = 5;
/** Partidas mínimas para entrar en rankings de promedios (evita que 1 noche distorsione). */
const MIN_GAMES = 3;

interface Row {
  key: string;
  name: string;
  value: string;
  valueColor?: string;
  detail?: string;
  onPress?: () => void;
}

function signed(n: number): string {
  return `${n > 0 ? '+' : ''}${formatMoney(n)}`;
}

function formatMinutes(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} h` : `${h} h ${String(rest).padStart(2, '0')} min`;
}

function decimal(n: number): string {
  return n.toLocaleString('es-AR');
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export default function ReportsScreen({ navigation, route }: ScreenProps<'Reports'>) {
  const { seasonId, seasonName } = route.params || {};
  const insets = useSafeAreaInsets();
  const { C } = useTheme();
  const styles = useMemo(() => createStyles(C), [C]);
  const [reports, setReports] = useState<Reports | null>(null);
  const [tab, setTab] = useState<Tab>('compras');

  const load = useCallback(async () => {
    setReports(await getReports(seasonId));
  }, [seasonId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openPlayer = useCallback((playerId: string, playerName: string) => {
    navigation.navigate('Stats', { playerId, playerName, seasonId, seasonName });
  }, [navigation, seasonId, seasonName]);

  const openSession = useCallback((sessionId: string) => {
    navigation.navigate('Session', { sessionId });
  }, [navigation]);

  if (!reports) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Text style={styles.loading}>Cargando...</Text>
      </SafeAreaView>
    );
  }

  if (reports.totalSessions === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📊</Text>
          <Text style={styles.emptyText}>Sin reportes aún</Text>
          <Text style={styles.emptyMuted}>
            {seasonId
              ? `Todavía no se cerró ninguna partida en ${seasonName}.`
              : 'Los reportes aparecen cuando al menos una partida esté cerrada.'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const tabs = seasonId ? TABS.filter(t => t.key !== 'temporadas') : TABS;
  const players = reports.players;
  const playerRow = (p: PlayerReport, value: string, detail?: string, valueColor?: string): Row => ({
    key: p.playerId, name: p.name, value, detail, valueColor,
    onPress: () => openPlayer(p.playerId, p.name),
  });
  const ranked = (filter: (p: PlayerReport) => boolean, sort: (a: PlayerReport, b: PlayerReport) => number) =>
    players.filter(filter).sort(sort);

  function renderCompras() {
    return (
      <>
        <RankedCard
          title="Más compras"
          subtitle="Cantidad total de compras de fichas"
          rows={ranked(() => true, (a, b) => b.buyCount - a.buyCount).map(p =>
            playerRow(p, String(p.buyCount), `${plural(p.games, 'partida', 'partidas')} · ${decimal(p.avgBuysPerGame)} por partida`)
          )}
          styles={styles}
        />
        <RankedCard
          title="Más plata puesta"
          subtitle="Total comprado en fichas"
          rows={ranked(() => true, (a, b) => b.totalBought - a.totalBought).map(p =>
            playerRow(p, formatMoney(p.totalBought), `Promedio ${formatMoney(p.avgBoughtPerGame)} por partida`)
          )}
          styles={styles}
        />
        <RankedCard
          title="Los que más recompran"
          subtitle="Partidas en las que compró más de una vez"
          rows={ranked(p => p.rebuyGames > 0, (a, b) => b.rebuyRate - a.rebuyRate || b.rebuyGames - a.rebuyGames).map(p =>
            playerRow(p, `${p.rebuyRate}%`, `${p.rebuyGames} de ${plural(p.games, 'partida', 'partidas')}`)
          )}
          styles={styles}
        />
        <RankedCard
          title="Récord de compras en una noche"
          rows={ranked(p => p.maxBuysInGame > 1, (a, b) => b.maxBuysInGame - a.maxBuysInGame).map(p =>
            playerRow(p, String(p.maxBuysInGame), p.maxBuysGame?.sessionName)
          )}
          styles={styles}
        />
        <RankedCard
          title="Recompra más rápida"
          subtitle="Tiempo promedio entre la primera y la segunda compra"
          rows={ranked(p => p.avgMinutesToRebuy !== null, (a, b) => (a.avgMinutesToRebuy ?? 0) - (b.avgMinutesToRebuy ?? 0)).map(p =>
            playerRow(p, formatMinutes(p.avgMinutesToRebuy ?? 0), plural(p.rebuyGames, 'recompra', 'recompras'))
          )}
          styles={styles}
        />
        <BarsCard title="Horario de las compras" buckets={reports!.buysByHour} styles={styles} C={C} />
      </>
    );
  }

  function renderRemontadas() {
    const recovered = ranked(p => p.recoveries.length > 0, (a, b) => {
      const lowA = Math.min(...a.recoveries.map(r => r.lowestBalance));
      const lowB = Math.min(...b.recoveries.map(r => r.lowestBalance));
      return lowA - lowB;
    });
    return (
      <>
        <RankedCard
          title="Salieron de negativo"
          subtitle="Su acumulado estuvo abajo y volvió a quedar positivo"
          rows={recovered.map(p => {
            const deepest = p.recoveries.reduce((d, r) => (r.lowestBalance < d.lowestBalance ? r : d));
            const times = p.recoveries.length > 1 ? ` · ${p.recoveries.length} veces` : '';
            return playerRow(
              p,
              formatMoney(deepest.lowestBalance),
              `Recuperó en ${deepest.recoveredAt.sessionName} (${plural(deepest.gamesToRecover, 'partida', 'partidas')})${times}`,
              C.red,
            );
          })}
          empty="Nadie salió de negativo todavía"
          styles={styles}
        />
        <RankedCard
          title="Mayor remontada"
          subtitle="Desde su peor momento hasta hoy"
          rows={ranked(p => p.comebackAmount > 0, (a, b) => b.comebackAmount - a.comebackAmount).map(p =>
            playerRow(p, signed(p.comebackAmount), `De ${formatMoney(p.lowestCumulative)} a ${signed(p.balance)}`, C.green)
          )}
          styles={styles}
        />
        <RankedCard
          title="Remontadas en la noche"
          subtitle="Compró 2 o más veces y terminó ganando"
          rows={ranked(p => p.nightComebacks > 0, (a, b) => b.nightComebacks - a.nightComebacks).map(p =>
            playerRow(p, String(p.nightComebacks), `de ${p.rebuyGames} con recompra`)
          )}
          styles={styles}
        />
        <RankedCard
          title="Racha actual"
          rows={ranked(p => p.currentStreak.count >= 2, (a, b) => b.currentStreak.count - a.currentStreak.count).map(p => {
            const win = p.currentStreak.type === 'win';
            return playerRow(p, `${win ? '🔥' : '🥶'} ${p.currentStreak.count}`, win ? 'ganadas seguidas' : 'perdidas seguidas', win ? C.green : C.red);
          })}
          empty="Nadie tiene una racha de 2 o más"
          styles={styles}
        />
        <RankedCard
          title="Racha ganadora más larga"
          rows={ranked(p => p.longestWinStreak > 0, (a, b) => b.longestWinStreak - a.longestWinStreak).map(p =>
            playerRow(p, String(p.longestWinStreak), 'partidas ganadas seguidas', C.green)
          )}
          styles={styles}
        />
        <RankedCard
          title="Racha perdedora más larga"
          rows={ranked(p => p.longestLossStreak > 0, (a, b) => b.longestLossStreak - a.longestLossStreak).map(p =>
            playerRow(p, String(p.longestLossStreak), 'partidas perdidas seguidas', C.red)
          )}
          styles={styles}
        />
        <RankedCard
          title="Mayor caída"
          subtitle="Lo que perdió desde su mejor momento"
          rows={ranked(p => p.maxDrawdown > 0, (a, b) => b.maxDrawdown - a.maxDrawdown).map(p =>
            playerRow(p, formatMoney(-p.maxDrawdown), `Mejor momento ${signed(p.highestCumulative)}`, C.red)
          )}
          styles={styles}
        />
      </>
    );
  }

  function renderRendimiento() {
    const regular = ranked(p => p.games >= MIN_GAMES, (a, b) => a.volatility - b.volatility);
    return (
      <>
        <RankedCard
          title="Retorno sobre lo comprado"
          subtitle="Ganancia o pérdida en relación a lo que compró"
          rows={ranked(() => true, (a, b) => b.roi - a.roi).map(p =>
            playerRow(p, `${p.roi > 0 ? '+' : ''}${p.roi}%`, `${signed(p.balance)} sobre ${formatMoney(p.totalBought)}`, p.roi >= 0 ? C.green : C.red)
          )}
          styles={styles}
        />
        <RankedCard
          title="Promedio por partida"
          rows={ranked(() => true, (a, b) => b.avgBalance - a.avgBalance).map(p =>
            playerRow(p, signed(p.avgBalance), `${p.wins}G / ${p.losses}P en ${plural(p.games, 'partida', 'partidas')}`, p.avgBalance >= 0 ? C.green : C.red)
          )}
          styles={styles}
        />
        <RankedCard
          title="Los más regulares"
          subtitle={`Cuánto varía su resultado de una noche a otra (mín. ${MIN_GAMES} partidas)`}
          rows={regular.map(p => playerRow(p, `±${formatMoney(p.volatility)}`, `Promedio ${signed(p.avgBalance)}`))}
          empty={`Nadie tiene ${MIN_GAMES} partidas todavía`}
          styles={styles}
        />
        <RankedCard
          title="Mejores noches"
          rows={reports!.biggestWins.map(r => ({
            key: `${r.sessionId}-${r.playerId}`, name: r.name, value: signed(r.balance), valueColor: C.green,
            detail: r.sessionName, onPress: () => openSession(r.sessionId),
          }))}
          styles={styles}
        />
        <RankedCard
          title="Peores noches"
          rows={reports!.biggestLosses.map(r => ({
            key: `${r.sessionId}-${r.playerId}`, name: r.name, value: signed(r.balance), valueColor: C.red,
            detail: `${r.sessionName} · ${plural(r.buyCount, 'compra', 'compras')}`, onPress: () => openSession(r.sessionId),
          }))}
          styles={styles}
        />
      </>
    );
  }

  function renderPartidas() {
    const r = reports!;
    return (
      <>
        <Card>
          <View style={styles.statsRow}>
            <Stat value={String(r.totalSessions)} label="Partidas" styles={styles} />
            <View style={styles.statDivider} />
            <Stat value={formatMoney(r.avgPot)} label="Pozo promedio" styles={styles} />
            <View style={styles.statDivider} />
            <Stat value={r.avgDurationMinutes !== null ? formatMinutes(r.avgDurationMinutes) : '—'} label="Duración prom." styles={styles} />
          </View>
        </Card>
        <RankedCard
          title="Pozos más grandes"
          rows={[...r.sessions].sort((a, b) => b.pot - a.pot).map(s => ({
            key: s.sessionId, name: s.sessionName, value: formatMoney(s.pot),
            detail: `${plural(s.players, 'jugador', 'jugadores')} · ${plural(s.buyCount, 'compra', 'compras')}`,
            onPress: () => openSession(s.sessionId),
          }))}
          styles={styles}
        />
        <RankedCard
          title="Partidas más largas"
          subtitle="Desde que se creó hasta que se cerró"
          rows={r.sessions.filter(s => (s.durationMinutes ?? 0) > 0)
            .sort((a, b) => (b.durationMinutes ?? 0) - (a.durationMinutes ?? 0))
            .map(s => ({
              key: s.sessionId, name: s.sessionName, value: formatMinutes(s.durationMinutes ?? 0),
              detail: new Date(s.date).toLocaleDateString('es-AR'), onPress: () => openSession(s.sessionId),
            }))}
          styles={styles}
        />
        <RankedCard
          title="Asistencia"
          rows={ranked(() => true, (a, b) => b.games - a.games).map(p =>
            playerRow(p, String(p.games), `${p.attendanceRate}% de las partidas`)
          )}
          styles={styles}
        />
        <RankedCard
          title="Más partidas seguidas"
          rows={ranked(p => p.longestAttendanceStreak > 1, (a, b) => b.longestAttendanceStreak - a.longestAttendanceStreak).map(p =>
            playerRow(p, String(p.longestAttendanceStreak), p.currentAttendanceStreak > 1 ? `Racha actual: ${p.currentAttendanceStreak}` : undefined)
          )}
          styles={styles}
        />
        <RankedCard
          title="Jugador del mes"
          rows={r.monthlyWinners.map(m => ({
            key: m.month, name: `${m.label} · ${m.name}`, value: signed(m.balance),
            valueColor: m.balance >= 0 ? C.green : C.red,
            detail: plural(m.sessions, 'partida', 'partidas'),
            onPress: () => openPlayer(m.playerId, m.name),
          }))}
          styles={styles}
        />
        <BarsCard title="Partidas por mes" buckets={r.sessionsByMonth} styles={styles} C={C} />
        <BarsCard title="Día de la semana" buckets={r.sessionsByWeekday} styles={styles} C={C} />
      </>
    );
  }

  function renderDeudas() {
    const r = reports!;
    const payers = r.payers.filter(p => p.paidDebts > 0);
    return (
      <>
        <Card>
          <View style={styles.statsRow}>
            <Stat value={formatMoney(r.debtSummary.totalOriginal)} label="Generado" styles={styles} />
            <View style={styles.statDivider} />
            <Stat value={formatMoney(r.debtSummary.totalPaid)} label="Pagado" color={C.green} styles={styles} />
            <View style={styles.statDivider} />
            <Stat value={formatMoney(r.debtSummary.totalPending)} label="Pendiente" color={C.red} styles={styles} />
          </View>
          <Text style={styles.cardNote}>{r.debtSummary.paidPercent}% de lo adeudado ya está pagado</Text>
        </Card>
        <RankedCard
          title="Quién le paga a quién"
          subtitle="Según el cierre de cada partida, antes de compensar deudas"
          rows={r.pairFlows.map(f => ({
            key: `${f.fromId}-${f.toId}`, name: `${f.fromName} → ${f.toName}`, value: formatMoney(f.amount),
            detail: plural(f.times, 'vez', 'veces'),
          }))}
          styles={styles}
        />
        <RankedCard
          title="Pagan más rápido"
          subtitle="Días promedio hasta saldar una deuda"
          rows={[...payers].sort((a, b) => a.avgDaysToPay - b.avgDaysToPay).map(p => ({
            key: p.playerId, name: p.name, value: `${decimal(p.avgDaysToPay)} d`,
            detail: plural(p.paidDebts, 'deuda saldada', 'deudas saldadas'),
            onPress: () => openPlayer(p.playerId, p.name),
          }))}
          empty="Todavía no hay deudas saldadas"
          styles={styles}
        />
        <RankedCard
          title="Más deben hoy"
          rows={r.payers.filter(p => p.pendingAmount > 0).sort((a, b) => b.pendingAmount - a.pendingAmount).map(p => ({
            key: p.playerId, name: p.name, value: formatMoney(p.pendingAmount), valueColor: C.red,
            onPress: () => openPlayer(p.playerId, p.name),
          }))}
          empty="No hay deudas pendientes 🎉"
          styles={styles}
        />
        <Text style={styles.footNote}>
          {seasonId
            ? 'Solo deudas generadas por partidas de esta temporada. Las compensadas entre varias partidas y las deudas previas no tienen temporada y no se incluyen.'
            : 'Las deudas compensadas toman como fecha el momento de la compensación, así que los días hasta pagar son aproximados. No incluye deudas previas.'}
        </Text>
      </>
    );
  }

  function renderTemporadas() {
    return reports!.seasons.map(s => (
      <Card key={s.seasonId}>
        <View style={styles.seasonHeader}>
          <Text style={styles.seasonName}>{s.name}</Text>
          {s.status === 'active' && <Text style={[styles.seasonBadge, { color: C.green }]}>● Activa</Text>}
        </View>
        {s.champion ? (
          <TouchableOpacity onPress={() => openPlayer(s.champion!.playerId, s.champion!.name)} activeOpacity={0.75}>
            <Text style={styles.seasonChampion}>
              🏆 {s.champion.name}{' '}
              <Text style={{ color: s.champion.balance >= 0 ? C.green : C.red }}>{signed(s.champion.balance)}</Text>
            </Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.rowDetail}>Sin partidas cerradas</Text>
        )}
        <Text style={styles.rowDetail}>
          {plural(s.sessions, 'partida', 'partidas')} · pozo total {formatMoney(s.totalPot)} · {decimal(s.avgPlayers)} jugadores por partida
        </Text>
      </Card>
    ));
  }

  const content = {
    compras: renderCompras,
    remontadas: renderRemontadas,
    rendimiento: renderRendimiento,
    partidas: renderPartidas,
    deudas: renderDeudas,
    temporadas: renderTemporadas,
  }[tab];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {tabs.map(t => (
            <TouchableOpacity
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[styles.tab, tab === t.key && styles.tabActive]}
              activeOpacity={0.8}>
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}>
        <View key={tab}>{content()}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Componentes ──────────────────────────────────────────────────────────────

type Styles = ReturnType<typeof createStyles>;

interface RankedCardProps {
  title: string;
  subtitle?: string;
  rows: Row[];
  empty?: string;
  styles: Styles;
}

function RankedCard({ title, subtitle, rows, empty = 'Sin datos todavía', styles }: RankedCardProps) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, TOP_N);
  return (
    <Card>
      <Text style={styles.cardTitle}>{title}</Text>
      {subtitle && <Text style={styles.cardSubtitle}>{subtitle}</Text>}
      {rows.length === 0 && <Text style={styles.rowDetail}>{empty}</Text>}
      {visible.map((row, idx) => (
        <TouchableOpacity
          key={row.key}
          disabled={!row.onPress}
          onPress={row.onPress}
          activeOpacity={0.75}
          style={[styles.rankRow, idx > 0 && styles.rankRowBorder]}>
          <Text style={styles.rankPos}>{idx + 1}</Text>
          <View style={styles.flex1}>
            <Text style={styles.rowName} numberOfLines={1}>{row.name}</Text>
            {row.detail ? <Text style={styles.rowDetail} numberOfLines={2}>{row.detail}</Text> : null}
          </View>
          <Text style={[styles.rowValue, row.valueColor ? { color: row.valueColor } : null]}>{row.value}</Text>
        </TouchableOpacity>
      ))}
      {rows.length > TOP_N && (
        <TouchableOpacity onPress={() => setExpanded(e => !e)} style={styles.moreBtn}>
          <Text style={styles.moreText}>{expanded ? 'Ver menos' : `Ver todos (${rows.length})`}</Text>
        </TouchableOpacity>
      )}
    </Card>
  );
}

interface BarsCardProps {
  title: string;
  buckets: CountBucket[];
  styles: Styles;
  C: Colors;
}

function BarsCard({ title, buckets, styles, C }: BarsCardProps) {
  if (buckets.length === 0) return null;
  const max = Math.max(...buckets.map(b => b.count));
  return (
    <Card>
      <Text style={[styles.cardTitle, styles.mb10]}>{title}</Text>
      {buckets.map(b => (
        <View key={b.key} style={styles.barRow}>
          <Text style={styles.barLabel} numberOfLines={1}>{b.label}</Text>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${(b.count / max) * 100}%`, backgroundColor: C.accent }]} />
          </View>
          <Text style={styles.barCount}>{b.count}</Text>
        </View>
      ))}
    </Card>
  );
}

function Stat({ value, label, color, styles }: { value: string; label: string; color?: string; styles: Styles }) {
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statNum, color ? { color } : null]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function createStyles(C: Colors) {
  return {
  ...createGlobalStyles(C),
  ...StyleSheet.create({
    scrollContent: { padding: 16, paddingTop: 4 },
    flex1: { flex: 1 },
    mb10: { marginBottom: 10 },

    // Tabs
    tabs: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
    tab: {
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
      backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder,
    },
    tabActive: { backgroundColor: C.accent, borderColor: C.accent },
    tabText: { fontSize: 14, fontWeight: '700', color: C.gray },
    tabTextActive: { color: C.bg },

    // Tarjetas
    cardTitle: { fontSize: 17, fontWeight: '700', color: C.white },
    cardSubtitle: { fontSize: 12, color: C.gray, marginTop: 2, marginBottom: 8 },
    cardNote: { fontSize: 13, color: C.gray, textAlign: 'center', marginTop: 12 },
    footNote: { fontSize: 12, color: C.gray, marginTop: 4, marginHorizontal: 4 },

    // Filas de ranking
    rankRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, gap: 10 },
    rankRowBorder: { borderTopWidth: 1, borderTopColor: C.cardBorder },
    rankPos: { width: 18, fontSize: 14, fontWeight: '700', color: C.gray, textAlign: 'center' },
    rowName: { fontSize: 16, fontWeight: '700', color: C.white },
    rowDetail: { fontSize: 12, color: C.gray, marginTop: 2 },
    rowValue: { fontSize: 16, fontWeight: '800', color: C.accent },
    moreBtn: { paddingTop: 10, alignItems: 'center' },
    moreText: { fontSize: 14, fontWeight: '700', color: C.accent },

    // Barras
    barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
    barLabel: { width: 82, fontSize: 13, color: C.gray },
    barTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: C.neutralSoftBg, overflow: 'hidden' },
    barFill: { height: 10, borderRadius: 5 },
    barCount: { width: 28, fontSize: 13, fontWeight: '700', color: C.white, textAlign: 'right' },

    // Resumen
    statsRow: { flexDirection: 'row', alignItems: 'center' },
    statItem: { alignItems: 'center', flex: 1, paddingHorizontal: 4 },
    statNum: { fontSize: 19, fontWeight: '800', color: C.white },
    statLabel: { fontSize: 12, color: C.gray, marginTop: 2 },
    statDivider: { width: 1, height: 30, backgroundColor: C.cardBorder },

    // Temporadas
    seasonHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    seasonName: { fontSize: 17, fontWeight: '700', color: C.white },
    seasonBadge: { fontSize: 13, fontWeight: '700' },
    seasonChampion: { fontSize: 15, fontWeight: '700', color: C.white, marginBottom: 4 },
  }),
  };
}
