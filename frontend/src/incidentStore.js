const STORAGE_KEY = "trustguard_incident_signals";

const DEFAULT_SIGNALS = {
  voice_risk: 91,
  document_risk: 68,
  identity_risk: 78,
  transaction_risk: 87,
  graph_risk: 88,
};

export function getIncidentSignals() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) {
      return { ...DEFAULT_SIGNALS };
    }

    return {
      ...DEFAULT_SIGNALS,
      ...JSON.parse(saved),
    };
  } catch (error) {
    console.error(
      "Unable to read TrustGuard incident state:",
      error
    );

    return { ...DEFAULT_SIGNALS };
  }
}

export function saveIncidentSignals(partialSignals) {
  const current = getIncidentSignals();

  const updated = {
    ...current,
    ...partialSignals,
  };

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(updated)
  );

  window.dispatchEvent(
    new CustomEvent("trustguard:risk-update", {
      detail: updated,
    })
  );

  return updated;
}

export function resetIncidentSignals() {
  const defaults = {
    ...DEFAULT_SIGNALS,
  };

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(defaults)
  );

  window.dispatchEvent(
    new CustomEvent("trustguard:risk-update", {
      detail: defaults,
    })
  );
}

export { DEFAULT_SIGNALS };