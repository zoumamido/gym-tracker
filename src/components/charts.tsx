import React, { useEffect, useMemo, useState } from 'react';
import { GestureResponderEvent, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, LinearGradient as SvgGradient, Path, Rect, Stop } from 'react-native-svg';
import { colors, fonts, radius } from '../theme';
import { Row, T } from './ui';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ---------- Progress ring ----------

export function ProgressRing({
  progress,
  size = 140,
  stroke = 12,
  color = colors.primary,
  colorEnd,
  track = colors.cardAlt,
  children,
}: {
  progress: number;
  size?: number;
  stroke?: number;
  color?: string;
  colorEnd?: string;
  track?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = useSharedValue(0);
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  useEffect(() => {
    p.value = withTiming(clamped, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [clamped, p]);
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - p.value) }));
  const gradId = `ring-${color.replace('#', '')}-${(colorEnd ?? color).replace('#', '')}`;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={color} />
            <Stop offset="1" stopColor={colorEnd ?? color} />
          </SvgGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={`url(#${gradId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${c} ${c}`}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}

// ---------- Line chart ----------

export interface Series {
  key: string;
  label: string;
  color: string;
  points: { x: number; y: number }[];
  /** 'line' (2px), 'dashed' projection, or 'dots' for raw readings. */
  style?: 'line' | 'dashed' | 'dots';
  area?: boolean;
}

export interface LineChartProps {
  series: Series[];
  height?: number;
  formatY?: (v: number) => string;
  formatX?: (v: number) => string;
  /** Horizontal reference line (e.g. goal weight). */
  reference?: { y: number; label: string; color?: string };
  yPadding?: number;
}

/** Smooth path through points (monotone-ish cubic using midpoints). */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const mx = (p0.x + p1.x) / 2;
    d += ` C${mx},${p0.y} ${mx},${p1.y} ${p1.x},${p1.y}`;
  }
  return d;
}

const PAD_L = 4;
const PAD_R = 44;
const PAD_T = 12;
const PAD_B = 22;

export function LineChart({ series, height = 200, formatY = (v) => v.toFixed(1), formatX, reference, yPadding = 0.08 }: LineChartProps) {
  const [width, setWidth] = useState(0);
  const [scrubX, setScrubX] = useState<number | null>(null);

  const all = series.flatMap((s) => s.points);
  const bounds = useMemo(() => {
    if (!all.length) return null;
    let minX = Math.min(...all.map((p) => p.x));
    let maxX = Math.max(...all.map((p) => p.x));
    let minY = Math.min(...all.map((p) => p.y));
    let maxY = Math.max(...all.map((p) => p.y));
    if (reference && Number.isFinite(reference.y)) {
      minY = Math.min(minY, reference.y);
      maxY = Math.max(maxY, reference.y);
    }
    if (minX === maxX) {
      minX -= 1;
      maxX += 1;
    }
    const span = maxY - minY || Math.max(1, Math.abs(maxY) * 0.05);
    return { minX, maxX, minY: minY - span * yPadding, maxY: maxY + span * yPadding };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, reference, yPadding]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  if (!bounds) {
    return <View style={{ height }} onLayout={onLayout} />;
  }

  const plotW = Math.max(1, width - PAD_L - PAD_R);
  const plotH = height - PAD_T - PAD_B;
  const sx = (x: number) => PAD_L + ((x - bounds.minX) / (bounds.maxX - bounds.minX)) * plotW;
  const sy = (y: number) => PAD_T + (1 - (y - bounds.minY) / (bounds.maxY - bounds.minY)) * plotH;
  const ticks = [0, 0.5, 1].map((t) => bounds.minY + t * (bounds.maxY - bounds.minY));

  // Scrub: nearest point on the first non-dots series (or any series).
  const primary = series.find((s) => s.style !== 'dots' && s.points.length) ?? series.find((s) => s.points.length);
  let scrub: { x: number; values: { label: string; color: string; y: number }[]; px: number } | null = null;
  if (scrubX != null && primary && width > 0) {
    const dataX = bounds.minX + ((scrubX - PAD_L) / plotW) * (bounds.maxX - bounds.minX);
    let best = primary.points[0];
    for (const p of primary.points) if (Math.abs(p.x - dataX) < Math.abs(best.x - dataX)) best = p;
    const values = series
      .map((s) => {
        const hit = s.points.find((p) => Math.abs(p.x - best.x) < 1e-6);
        return hit ? { label: s.label, color: s.color, y: hit.y } : null;
      })
      .filter((v): v is { label: string; color: string; y: number } => v != null);
    scrub = { x: best.x, values, px: sx(best.x) };
  }

  const handleTouch = (e: GestureResponderEvent) => setScrubX(e.nativeEvent.locationX);

  return (
    <View>
      <View
        style={{ height }}
        onLayout={onLayout}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={handleTouch}
        onResponderMove={handleTouch}
        onResponderRelease={() => setScrubX(null)}
        onResponderTerminate={() => setScrubX(null)}
        onResponderTerminationRequest={() => true}
      >
        {width > 0 ? (
          <Svg width={width} height={height}>
            <Defs>
              {series.map((s) => (
                <SvgGradient key={s.key} id={`area-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={s.color} stopOpacity={0.28} />
                  <Stop offset="1" stopColor={s.color} stopOpacity={0} />
                </SvgGradient>
              ))}
            </Defs>
            {ticks.map((t, i) => (
              <Line key={i} x1={PAD_L} x2={PAD_L + plotW} y1={sy(t)} y2={sy(t)} stroke={colors.border} strokeWidth={1} strokeDasharray={i === 0 ? undefined : '3 5'} />
            ))}
            {reference && Number.isFinite(reference.y) ? (
              <Line x1={PAD_L} x2={PAD_L + plotW} y1={sy(reference.y)} y2={sy(reference.y)} stroke={reference.color ?? colors.success} strokeWidth={1.5} strokeDasharray="6 4" />
            ) : null}
            {series.map((s) => {
              const pts = s.points.map((p) => ({ x: sx(p.x), y: sy(p.y) }));
              if (s.style === 'dots') {
                return pts.map((p, i) => <Circle key={`${s.key}-${i}`} cx={p.x} cy={p.y} r={3} fill={s.color} opacity={0.55} />);
              }
              const d = smoothPath(pts);
              return (
                <React.Fragment key={s.key}>
                  {s.area && pts.length > 1 ? <Path d={`${d} L${pts[pts.length - 1].x},${PAD_T + plotH} L${pts[0].x},${PAD_T + plotH} Z`} fill={`url(#area-${s.key})`} /> : null}
                  <Path d={d} stroke={s.color} strokeWidth={2} fill="none" strokeDasharray={s.style === 'dashed' ? '6 5' : undefined} strokeLinecap="round" />
                  {pts.length === 1 ? <Circle cx={pts[0].x} cy={pts[0].y} r={4} fill={s.color} /> : null}
                </React.Fragment>
              );
            })}
            {/* Endpoint marker on the primary series */}
            {primary && primary.points.length > 1 && !scrub ? (
              <Circle cx={sx(primary.points[primary.points.length - 1].x)} cy={sy(primary.points[primary.points.length - 1].y)} r={5} fill={primary.color} stroke={colors.card} strokeWidth={2} />
            ) : null}
            {scrub ? (
              <>
                <Line x1={scrub.px} x2={scrub.px} y1={PAD_T} y2={PAD_T + plotH} stroke={colors.textMuted} strokeWidth={1} />
                {scrub.values.map((v, i) => (
                  <Circle key={i} cx={scrub!.px} cy={sy(v.y)} r={5} fill={v.color} stroke={colors.card} strokeWidth={2} />
                ))}
              </>
            ) : null}
            <Rect x={0} y={0} width={0} height={0} />
          </Svg>
        ) : null}
        {/* Y labels */}
        {width > 0
          ? ticks.map((t, i) => (
              <T key={i} variant="caption" color={colors.textMuted} style={{ position: 'absolute', right: 0, top: sy(t) - 8, width: PAD_R - 6, textAlign: 'right', fontSize: 11 }}>
                {formatY(t)}
              </T>
            ))
          : null}
        {/* X labels */}
        {width > 0 && formatX ? (
          <>
            <T variant="caption" color={colors.textMuted} style={{ position: 'absolute', left: PAD_L, bottom: 0, fontSize: 11 }}>
              {formatX(bounds.minX)}
            </T>
            <T variant="caption" color={colors.textMuted} style={{ position: 'absolute', right: PAD_R, bottom: 0, fontSize: 11 }}>
              {formatX(bounds.maxX)}
            </T>
          </>
        ) : null}
        {scrub ? (
          <View pointerEvents="none" style={[styles.tooltip, { left: Math.min(Math.max(0, scrub.px - 70), Math.max(0, width - 150)) }]}>
            {formatX ? (
              <T variant="caption" color={colors.textDim} style={{ marginBottom: 2 }}>
                {formatX(scrub.x)}
              </T>
            ) : null}
            {scrub.values.map((v) => (
              <Row key={v.label} gap={6}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: v.color }} />
                <T variant="caption" color={colors.text} style={{ fontFamily: fonts.semibold }}>
                  {formatY(v.y)}
                </T>
                <T variant="caption" color={colors.textMuted}>
                  {v.label}
                </T>
              </Row>
            ))}
          </View>
        ) : null}
      </View>
      {series.length > 1 || reference ? (
        <Row gap={14} style={{ marginTop: 10, flexWrap: 'wrap' }}>
          {series.map((s) => (
            <Row key={s.key} gap={6}>
              <LegendSwatch color={s.color} style={s.style} />
              <T variant="caption" color={colors.textDim}>
                {s.label}
              </T>
            </Row>
          ))}
          {reference ? (
            <Row gap={6}>
              <LegendSwatch color={reference.color ?? colors.success} style="dashed" />
              <T variant="caption" color={colors.textDim}>
                {reference.label}
              </T>
            </Row>
          ) : null}
        </Row>
      ) : null}
    </View>
  );
}

function LegendSwatch({ color, style }: { color: string; style?: Series['style'] }) {
  if (style === 'dots') return <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, opacity: 0.7 }} />;
  if (style === 'dashed')
    return (
      <Row gap={2}>
        <View style={{ width: 6, height: 2, backgroundColor: color }} />
        <View style={{ width: 6, height: 2, backgroundColor: color }} />
      </Row>
    );
  return <View style={{ width: 14, height: 2, borderRadius: 1, backgroundColor: color }} />;
}

// ---------- Horizontal bars ----------

export function HBar({ label, value, max, color, right, marker }: { label: string; value: number; max: number; color: string; right?: string; marker?: { from: number; to: number } }) {
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <View style={{ marginBottom: 12 }}>
      <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
        <T variant="small" color={colors.text}>
          {label}
        </T>
        <T variant="caption" color={colors.textDim}>
          {right}
        </T>
      </Row>
      <View style={{ height: 10, backgroundColor: colors.cardAlt, borderRadius: 5, overflow: 'hidden' }}>
        {marker && max > 0 ? (
          <View
            style={{
              position: 'absolute',
              left: `${Math.min(100, (marker.from / max) * 100)}%`,
              width: `${Math.max(0, Math.min(100, ((marker.to - marker.from) / max) * 100))}%`,
              top: 0,
              bottom: 0,
              backgroundColor: 'rgba(52, 211, 153, 0.16)',
            }}
          />
        ) : null}
        <View style={{ width: `${pct * 100}%`, height: 10, backgroundColor: color, borderRadius: 5 }} />
      </View>
    </View>
  );
}

// ---------- Vertical mini bars (weekly volume etc.) ----------

export function MiniBars({ values, labels, color = colors.primary, height = 90, highlightLast = true, format }: { values: number[]; labels: string[]; color?: string; height?: number; highlightLast?: boolean; format?: (v: number) => string }) {
  const max = Math.max(1, ...values);
  return (
    <Row align="flex-end" gap={6} style={{ height: height + 34 }}>
      {values.map((v, i) => {
        const h = Math.max(4, (v / max) * height);
        const last = highlightLast && i === values.length - 1;
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            {format && v > 0 ? (
              <T variant="caption" color={colors.textMuted} style={{ fontSize: 10 }} numberOfLines={1}>
                {format(v)}
              </T>
            ) : null}
            <View style={{ width: '100%', maxWidth: 28, height: h, borderRadius: 6, backgroundColor: v > 0 ? color : colors.cardAlt, opacity: last || v === 0 ? 1 : 0.55 }} />
            <T variant="caption" color={last ? colors.text : colors.textMuted} style={{ fontSize: 11 }}>
              {labels[i]}
            </T>
          </View>
        );
      })}
    </Row>
  );
}

// ---------- Activity heatmap (GitHub-style) ----------

export function ActivityHeatmap({ weeks, today, countFor, color = colors.primary }: { weeks: number; today: Date; countFor: (d: Date) => number; color?: string }) {
  // Columns = weeks (Mon-start), rows = weekdays Mon..Sun.
  const dow = (today.getDay() + 6) % 7; // 0 = Monday
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - dow - (weeks - 1) * 7);
  const cols: { date: Date; count: number; future: boolean }[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
      col.push({ date, count: date > today ? 0 : countFor(date), future: date > today });
    }
    cols.push(col);
  }
  return (
    <View>
      <Row gap={4} align="flex-start">
        <View style={{ gap: 4, marginRight: 2 }}>
          {['M', '', 'W', '', 'F', '', 'S'].map((l, i) => (
            <View key={i} style={{ height: 14, justifyContent: 'center' }}>
              <T variant="caption" color={colors.textMuted} style={{ fontSize: 9 }}>
                {l}
              </T>
            </View>
          ))}
        </View>
        {cols.map((col, i) => (
          <View key={i} style={{ gap: 4, flex: 1 }}>
            {col.map((c, j) => (
              <View
                key={j}
                style={{
                  height: 14,
                  borderRadius: 4,
                  backgroundColor: c.future ? 'transparent' : c.count > 0 ? color : colors.cardAlt,
                  opacity: c.count > 1 ? 1 : c.count === 1 ? 0.85 : 1,
                  borderWidth: c.date.toDateString() === today.toDateString() ? 1.5 : 0,
                  borderColor: colors.text,
                }}
              />
            ))}
          </View>
        ))}
      </Row>
      <Row gap={6} style={{ marginTop: 10, justifyContent: 'flex-end' }}>
        <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: colors.cardAlt }} />
        <T variant="caption" color={colors.textMuted}>
          Rest
        </T>
        <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color, marginLeft: 8 }} />
        <T variant="caption" color={colors.textMuted}>
          Workout
        </T>
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  tooltip: {
    position: 'absolute',
    top: 0,
    minWidth: 140,
    backgroundColor: colors.elevated,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
});
