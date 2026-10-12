/** Torn-only extraction from the original animationTimeline.ts; functions are verbatim. */
export interface TornTimeline {
  readonly phase: "blank" | "assemble" | "settle" | "hold";
  readonly visible: boolean;
  readonly assemblyProgress: number;
  readonly settleProgress: number;
  readonly seamOpacity: number;
}
export const TORN_PHASES = Object.freeze({
  leadEnd: 0.05,
  assemblyEnd: 0.72,
  settleEnd: 0.86,
});

export function clamp01(value: number): number {
  if (Number.isNaN(value) || value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export function smoothstep01(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

export function smootherstep01(value: number): number {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function segmentProgress(time: number, start: number, end: number): number {
  if (!Number.isFinite(time)) return time === Number.POSITIVE_INFINITY ? 1 : 0;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return time >= end ? 1 : 0;
  }
  return clamp01((time - start) / (end - start));
}

export function resolveTornTimeline(normalizedTime: number): TornTimeline {
  const time = clamp01(normalizedTime);

  if (time < TORN_PHASES.leadEnd) {
    return {
      phase: "blank",
      visible: false,
      assemblyProgress: 0,
      settleProgress: 0,
      seamOpacity: 0,
    };
  }

  if (time < TORN_PHASES.assemblyEnd) {
    const linearProgress = segmentProgress(
      time,
      TORN_PHASES.leadEnd,
      TORN_PHASES.assemblyEnd,
    );
    return {
      phase: "assemble",
      visible: true,
      assemblyProgress: smootherstep01(linearProgress),
      settleProgress: 0,
      seamOpacity: 1,
    };
  }

  if (time < TORN_PHASES.settleEnd) {
    const settleProgress = smoothstep01(
      segmentProgress(time, TORN_PHASES.assemblyEnd, TORN_PHASES.settleEnd),
    );
    return {
      phase: "settle",
      visible: true,
      assemblyProgress: 1,
      settleProgress,
      seamOpacity: 1 - settleProgress,
    };
  }

  return {
    phase: "hold",
    visible: true,
    assemblyProgress: 1,
    settleProgress: 1,
    seamOpacity: 0,
  };
}
