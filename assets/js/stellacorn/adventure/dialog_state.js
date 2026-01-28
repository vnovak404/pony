export function evaluateConditions(conditions = [], state) {
  if (!conditions.length) return true;
  return conditions.every((condition) => evaluateCondition(condition, state));
}

function evaluateCondition(condition, state) {
  if (!condition || typeof condition !== "object") return true;
  const type = condition.type || "flag";
  if (type === "first_time" || type === "first_time_speaking" || type === "first_time_speaking_to") {
    const targetId = condition.targetId || condition.target || condition.npc || "";
    if (!targetId) return true;
    const flagKey = `first_time_speaking_to_${targetId}`;
    if (state.localFlags.has(flagKey)) {
      return Boolean(state.localFlags.get(flagKey));
    }
    return !state.talkedTo.has(targetId);
  }
  if (type === "event") {
    const key = condition.key || condition.event;
    if (!key) return true;
    return Boolean(state.events.get(key));
  }
  const scope = condition.scope || "local";
  const flag = condition.flag || condition.key;
  if (!flag) return true;
  const value = scope === "global" ? state.globalFlags.get(flag) : state.localFlags.get(flag);
  const op = condition.op || "==";
  const expected = condition.value;
  return compare(value, expected, op);
}

function compare(actual, expected, op) {
  switch (op) {
    case "!=":
      return actual !== expected;
    case ">":
      return Number(actual) > Number(expected);
    case ">=":
      return Number(actual) >= Number(expected);
    case "<":
      return Number(actual) < Number(expected);
    case "<=":
      return Number(actual) <= Number(expected);
    case "contains":
      return Array.isArray(actual) && actual.includes(expected);
    default:
      return actual === expected;
  }
}

export function applyFlagUpdates(updates = [], state) {
  updates.forEach((update) => {
    if (!update || typeof update !== "object") return;
    const scope = update.scope || "local";
    const flag = update.flag || update.key;
    if (!flag) return;
    const value = update.value ?? true;
    if (scope === "global") {
      state.globalFlags.set(flag, value);
    } else {
      state.localFlags.set(flag, value);
    }
  });
}

export function markTalkedTo(targetId, state) {
  if (!targetId) return;
  state.talkedTo.add(targetId);
  state.localFlags.set(`first_time_speaking_to_${targetId}`, false);
}

export function seedFirstTimeFlags(targetIds, state) {
  targetIds.forEach((targetId) => {
    if (!targetId) return;
    if (!state.talkedTo.has(targetId)) {
      state.localFlags.set(`first_time_speaking_to_${targetId}`, true);
    }
  });
}
