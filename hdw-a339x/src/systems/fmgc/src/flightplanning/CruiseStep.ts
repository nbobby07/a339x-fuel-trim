export type CruiseStepEntry = {
  /**
   * Distance before waypoint that the step should be inserted.
   */
  distanceBeforeTermination: number;
  /**
   * Altitude to step to.
   */
  toAltitude: number;
  /**
   * Index of the waypoint to insert the step at.
   * WARNING: Is not always updated, e.g. for DIRECT TOs
   */
  waypointIndex: number;
  /**
   * Whether the step should be ignored.
   */
  isIgnored: boolean;
};

// Match the A339X FMC cruise ceiling; performance-limited MAX FL is still shown by STEP ALTS.
export const MAX_CRUISE_STEP_ALTITUDE = 41000;

/** Planned cruise level from the step waypoint onward, independent of VNAV interpolation. */
export function plannedCruiseLevelAtWaypoint(
  initialLevel: number | null,
  steps: Pick<CruiseStepEntry, 'waypointIndex' | 'toAltitude'>[],
  waypointIndex: number,
): number | undefined {
  if (
    initialLevel === null ||
    !Number.isFinite(initialLevel) ||
    initialLevel < 10 ||
    initialLevel > MAX_CRUISE_STEP_ALTITUDE / 100
  ) {
    return undefined;
  }
  let level = initialLevel;
  let lastIndex = -1;
  for (const step of steps) {
    if (
      step.waypointIndex <= waypointIndex &&
      step.waypointIndex > lastIndex &&
      Number.isFinite(step.toAltitude) &&
      step.toAltitude >= 1000 &&
      step.toAltitude <= MAX_CRUISE_STEP_ALTITUDE
    ) {
      level = step.toAltitude / 100;
      lastIndex = step.waypointIndex;
    }
  }
  return level;
}

/** Validate the complete sequence, replacing an existing step at the edited index. */
export function isCruiseStepInsertionValid(
  steps: Pick<CruiseStepEntry, 'waypointIndex' | 'toAltitude'>[],
  waypointIndex: number,
  toAltitude: number,
  cruiseLevel: number,
): boolean {
  let altitude = cruiseLevel * 100;
  if (!Number.isFinite(altitude) || altitude < 1000 || altitude > MAX_CRUISE_STEP_ALTITUDE) {
    return false;
  }
  const sequence = steps
    .filter((step) => step.waypointIndex !== waypointIndex)
    .concat({ waypointIndex, toAltitude })
    .sort((a, b) => a.waypointIndex - b.waypointIndex);
  let descending = false;
  for (const step of sequence) {
    if (
      !Number.isInteger(step.toAltitude) ||
      step.toAltitude < 1000 ||
      step.toAltitude > MAX_CRUISE_STEP_ALTITUDE ||
      Math.abs(step.toAltitude - altitude) < 1000 ||
      (descending && step.toAltitude > altitude)
    ) {
      return false;
    }
    descending ||= step.toAltitude < altitude;
    altitude = step.toAltitude;
  }
  return true;
}
