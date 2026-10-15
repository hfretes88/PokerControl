import React, { useState, useCallback, useMemo, useLayoutEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Linking
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import { getReports } from '../storage/reports';
import type { Reports, CountBucket, SeasonSummary } from '../storage/reports';
import { buildSections, tabsFor, decimal, signed, plural, awardsMessage, REPORT_TABS } from '../reports/reportSections';
import type { ReportTab, ReportRow, ReportSection, ReportStat, Tone, Award } from '../reports/reportSections';
import RaceChart from '../components/charts/RaceChart';
import Heatmap from '../components/charts/Heatmap';
import ShareBar from '../components/charts/ShareBar';
import { buildReportsPdf } from '../reports/reportsPdf';
import { saveFile } from '../utils/saveFile';
import { Card, formatMoney } from '../components/UI';
import type { Colors } from '../components/UI';
import { createGlobalStyles } from '../components/GlobalStyles';
import { useTheme } from '../theme/ThemeContext';
import type { ScreenProps } from '../navigation/types';

const TOP_N = 5;

function toneColor(C: Colors, tone?: Tone): string {
  return tone === 'positive' ? C.green : tone === 'negative' ? C.red : C.accent;
}

export default function ReportsScreen({ navigation, route }: ScreenProps<'Reports'>) {
  const { seasonId, seasonName } = route.params || {};
  const insets = useSafeAreaInsets();
  const { C } = useTheme();
  const styles = useMemo(() => createStyles(C), [C]);
  const [reports, setReports] = useState<Reports | null>(null);
  const [tab, setTab] = useState<ReportTab>(REPORT_TABS[0].key);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setReports(await getReports(seasonId));
  }, [seasonId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleExport = useCallback(async () => {
    if (!reports) return;
    setExporting(true);
    try {
      const pdf = await buildReportsPdf(reports, seasonId, seasonName);
      const scope = seasonName ? seasonName.replace(/[^\w-]+/g, '_') : 'historico';
      await saveFile({
        filename: `PokerControl_reportes_${scope}_${new Date().toISOString().slice(0, 10)}.pdf`,
        contents: pdf,
        encoding: 'base64',
        mimeType: 'application/pdf',
        title: 'PokerControl — Reportes',
      });
    } catch (err) {
      if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) return;
      const message = err instanceof Error ? err.message : String(err);
      if (message !== 'User did not share') Alert.alert('Error al exportar', message);
    } finally {
      setExporting(false);
    }
  }, [reports, seasonId, seasonName]);

  const canExport = !!reports && reports.totalSessions > 0;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: canExport
        ? () => (
          <TouchableOpacity onPress={handleExport} disabled={exporting} style={styles.exportBtn}>
            {exporting
              ? <ActivityIndicator size="small" color={C.accent} />
              : <Text style={styles.exportText}>PDF</Text>}
          </TouchableOpacity>
        )
        : undefined,
    });
  }, [navigation, canExport, exporting, handleExport, styles, C]);

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

  function renderSection(section: ReportSection, idx: number) {
    switch (section.kind) {
      case 'ranked':
        return (
          <RankedCard
            key={idx}
            title={section.title}
            subtitle={section.subtitle}
            rows={section.rows}
            empty={section.empty}
            onOpenSession={openSession}
            styles={styles}
            C={C}
          />
        );
      case 'stats':
        return <StatsCard key={idx} stats={section.stats} note={section.note} styles={styles} C={C} />;
      case 'bars':
        return (
          <BarsCard key={idx} title={section.title} subtitle={section.subtitle} buckets={section.buckets} styles={styles} C={C} />
        );
      case 'seasons':
        return section.seasons.map(s => <SeasonCard key={s.seasonId} season={s} styles={styles} C={C} />);
      case 'note':
        return <Text key={idx} style={styles.footNote}>{section.text}</Text>;
      case 'race':
        return (
          <ChartCard key={idx} title={section.title} subtitle={section.subtitle} styles={styles}>
            <RaceChart race={section.race} />
          </ChartCard>
        );
      case 'heatmap':
        return (
          <ChartCard key={idx} title={section.title} subtitle={section.subtitle} styles={styles}>
            <Heatmap race={section.race} />
          </ChartCard>
        );
      case 'share':
        return (
          <ChartCard key={idx} title={section.title} subtitle={section.subtitle} styles={styles}>
            <ShareBar items={section.items} />
          </ChartCard>
        );
      case 'awards':
        return <AwardsCard key={idx} title={section.title} awards={section.awards} scopeName={seasonName} styles={styles} />;
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {tabsFor(seasonId).map(t => (
            <TouchableOpacity
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[styles.tab, tab === t.key && styles.tabActive]}
              activeOpacity={0.8}>
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.icon} {t.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}>
        <View key={tab}>{buildSections(tab, reports, seasonId).map(renderSection)}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Componentes ──────────────────────────────────────────────────────────────

type Styles = ReturnType<typeof createStyles>;

interface RankedCardProps {
  title: string;
  subtitle?: string;
  rows: ReportRow[];
  empty?: string;
  onOpenSession: (sessionId: string) => void;
  styles: Styles;
  C: Colors;
}

function RankedCard({ title, subtitle, rows, empty = 'Sin datos todavía', onOpenSession, styles, C }: RankedCardProps) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, TOP_N);
  return (
    <Card>
      <Text style={styles.cardTitle}>{title}</Text>
      {subtitle && <Text style={styles.cardSubtitle}>{subtitle}</Text>}
      {rows.length === 0 && <Text style={styles.rowDetail}>{empty}</Text>}
      {visible.map((row, idx) => {
        const { sessionId } = row;
        return (
          <TouchableOpacity
            key={row.key}
            disabled={!sessionId}
            onPress={sessionId ? () => onOpenSession(sessionId) : undefined}
            activeOpacity={0.75}
            style={[styles.rankRow, idx > 0 && styles.rankRowBorder]}>
            <Text style={styles.rankPos}>{idx + 1}</Text>
            <View style={styles.flex1}>
              <Text style={styles.rowName} numberOfLines={1}>{row.name}</Text>
              {row.detail ? <Text style={styles.rowDetail} numberOfLines={2}>{row.detail}</Text> : null}
            </View>
            <Text style={[styles.rowValue, { color: toneColor(C, row.tone) }]}>{row.value}</Text>
          </TouchableOpacity>
        );
      })}
      {rows.length > TOP_N && (
        <TouchableOpacity onPress={() => setExpanded(e => !e)} style={styles.moreBtn}>
          <Text style={styles.moreText}>{expanded ? 'Ver menos' : `Ver todos (${rows.length})`}</Text>
        </TouchableOpacity>
      )}
    </Card>
  );
}

function StatsCard({ stats, note, styles, C }: { stats: ReportStat[]; note?: string; styles: Styles; C: Colors }) {
  return (
    <Card>
      <View style={styles.statsRow}>
        {stats.map((s, i) => (
          <React.Fragment key={s.label}>
            {i > 0 && <View style={styles.statDivider} />}
            <View style={styles.statItem}>
              <Text
                style={[styles.statNum, s.tone ? { color: toneColor(C, s.tone) } : null]}
                numberOfLines={1}
                adjustsFontSizeToFit>
                {s.value}
              </Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>
      {note && <Text style={styles.cardNote}>{note}</Text>}
    </Card>
  );
}

function ChartCard({ title, subtitle, styles, children }: { title: string; subtitle: string; styles: Styles; children: React.ReactNode }) {
  return (
    <Card>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardSubtitle}>{subtitle}</Text>
      {children}
    </Card>
  );
}

function AwardsCard({ title, awards, scopeName, styles }: { title: string; awards: Award[]; scopeName?: string; styles: Styles }) {
  const share = async () => {
    const url = `whatsapp://send?text=${encodeURIComponent(awardsMessage(awards, scopeName))}`;
    if (await Linking.canOpenURL(url)) {
      Linking.openURL(url);
    } else {
      Alert.alert('WhatsApp no disponible', 'No se encontró WhatsApp en este dispositivo.');
    }
  };
  if (awards.length === 0) return null;
  return (
    <Card>
      <View style={styles.awardsHeader}>
        <Text style={styles.cardTitle}>🏆 {title}</Text>
        <TouchableOpacity onPress={share} style={styles.shareBtn} activeOpacity={0.8}>
          <Text style={styles.shareText}>Compartir</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.awardsGrid}>
        {awards.map(a => (
          <View key={a.key} style={styles.award}>
            <Text style={styles.awardIcon}>{a.icon}</Text>
            <Text style={styles.awardTitle} numberOfLines={1}>{a.title}</Text>
            <Text style={styles.awardName} numberOfLines={1}>{a.name}</Text>
            <Text style={styles.awardValue} numberOfLines={1}>{a.value}</Text>
            <Text style={styles.awardDetail} numberOfLines={2}>{a.detail}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function BarsCard({ title, subtitle, buckets, styles, C }: { title: string; subtitle?: string; buckets: CountBucket[]; styles: Styles; C: Colors }) {
  if (buckets.length === 0) return null;
  const max = Math.max(...buckets.map(b => b.count));
  return (
    <Card>
      <Text style={[styles.cardTitle, !subtitle && styles.mb10]}>{title}</Text>
      {subtitle && <Text style={styles.cardSubtitle}>{subtitle}</Text>}
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

function SeasonCard({ season: s, styles, C }: { season: SeasonSummary; styles: Styles; C: Colors }) {
  return (
    <Card>
      <View style={styles.seasonHeader}>
        <Text style={styles.seasonName}>{s.name}</Text>
        {s.status === 'active' && <Text style={[styles.seasonBadge, { color: C.green }]}>● Activa</Text>}
      </View>
      {s.champion ? (
        <Text style={styles.seasonChampion}>
          🏆 {s.champion.name}{' '}
          <Text style={{ color: s.champion.balance >= 0 ? C.green : C.red }}>{signed(s.champion.balance)}</Text>
        </Text>
      ) : (
        <Text style={styles.rowDetail}>Sin partidas cerradas</Text>
      )}
      <Text style={styles.rowDetail}>
        {plural(s.sessions, 'partida', 'partidas')} · pozo total {formatMoney(s.totalPot)} · {decimal(s.avgPlayers)} jugadores por partida
      </Text>
    </Card>
  );
}

function createStyles(C: Colors) {
  return {
  ...createGlobalStyles(C),
  ...StyleSheet.create({
    scrollContent: { padding: 16, paddingTop: 4 },
    flex1: { flex: 1 },
    mb10: { marginBottom: 10 },

    // Exportar
    exportBtn: {
      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
      borderWidth: 1, borderColor: C.accent, minWidth: 52, alignItems: 'center',
    },
    exportText: { fontSize: 14, fontWeight: '800', color: C.accent },

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
    rowValue: { fontSize: 16, fontWeight: '800' },
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

    // Premios
    awardsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    shareBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: C.green },
    shareText: { fontSize: 13, fontWeight: '800', color: '#fff' },
    awardsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    award: {
      width: '48.5%', padding: 10, borderRadius: 10,
      backgroundColor: C.neutralSoftBg, borderWidth: 1, borderColor: C.cardBorder,
    },
    awardIcon: { fontSize: 24 },
    awardTitle: { fontSize: 12, fontWeight: '700', color: C.gray, marginTop: 4 },
    awardName: { fontSize: 17, fontWeight: '800', color: C.white, marginTop: 2 },
    awardValue: { fontSize: 14, fontWeight: '700', color: C.accent, marginTop: 2 },
    awardDetail: { fontSize: 11, color: C.gray, marginTop: 4 },

    // Temporadas
    seasonHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    seasonName: { fontSize: 17, fontWeight: '700', color: C.white },
    seasonBadge: { fontSize: 13, fontWeight: '700' },
    seasonChampion: { fontSize: 15, fontWeight: '700', color: C.white, marginBottom: 4 },
  }),
  };
}
