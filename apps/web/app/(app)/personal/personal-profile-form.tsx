'use client';

import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';

type Location = {
  id: string;
  label: string;
  kind: 'home' | 'work' | 'common';
  address: string;
  hasAddress?: boolean;
};
type Day = {
  weekday: number;
  preferredFocusWindows: string[];
  guaranteedBusyWindows: string[];
  preferredTrainingWindows: string[];
};
type Commitment = {
  id: string;
  title: string;
  dueAt: string | null;
  importance: number;
  status: 'open' | 'completed' | 'deferred';
};
type Routine = {
  id: string;
  title: string;
  cadence: string;
  preferredWindow: Record<string, string>;
  active: boolean;
};
type TravelRule = {
  id?: string;
  originLocationId: string;
  destinationLocationId: string;
  transportMode: 'walking' | 'cycling' | 'public_transport' | 'driving' | 'other';
  normalMinutes: number;
  peakMinutes: number;
  peakStart: string | null;
  peakEnd: string | null;
  bufferPercent: number;
  minimumBufferMinutes: number;
};
type PreparationRule = {
  id?: string;
  locationId: string;
  prepareBeforeDepartureMinutes: number;
  settleAfterArrivalMinutes: number;
};
type Preferences = {
  normalWorkStart: string;
  normalWorkEnd: string;
  quietStart: string;
  quietEnd: string;
  maximumFocusDurationMinutes: number;
  minimumUnscheduledBufferMinutes: number;
  minimumEveningBufferMinutes: number;
  preparationBufferMinutes: number;
  travelBufferPercent: number;
  minimumTravelBufferMinutes: number;
  transportPreferences: string;
};
type Profile = {
  dateOfBirth: string | null;
  careerSummary: string;
  preferences: Preferences;
  locations: Location[];
  travelRules: TravelRule[];
  preparationRules: PreparationRule[];
  timePreferences: Day[];
  commitments: Commitment[];
  routines: Routine[];
};

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const emptyDays = (): Day[] =>
  days.map((_, weekday) => ({
    weekday,
    preferredFocusWindows: [],
    guaranteedBusyWindows: [],
    preferredTrainingWindows: [],
  }));
const emptyProfile = (): Profile => ({
  dateOfBirth: null,
  careerSummary: '',
  preferences: {
    normalWorkStart: '09:00',
    normalWorkEnd: '17:00',
    quietStart: '22:30',
    quietEnd: '07:00',
    maximumFocusDurationMinutes: 90,
    minimumUnscheduledBufferMinutes: 30,
    minimumEveningBufferMinutes: 60,
    preparationBufferMinutes: 15,
    travelBufferPercent: 20,
    minimumTravelBufferMinutes: 5,
    transportPreferences: 'walking, public transport',
  },
  locations: [],
  travelRules: [],
  preparationRules: [],
  timePreferences: emptyDays(),
  commitments: [],
  routines: [],
});
const asLines = (value: string) =>
  value
    .split(/[\n,]/)
    .map((part) => part.trim())
    .filter(Boolean);
const asText = (values: string[]) => values.join('\n');
const prettyError = (payload: unknown) => {
  const value = payload as {
    code?: string;
    diagnostic?: {
      stage?: string;
      httpStatus?: number;
      requestId?: string;
      detail?: string;
      remediation?: string;
    };
  };
  const d = value.diagnostic;
  return d
    ? `${value.code ?? 'profile_request_failed'} · ${d.stage ?? 'unknown'} · HTTP ${d.httpStatus ?? 'n/a'} · request ${d.requestId ?? 'unknown'} — ${d.detail ?? 'No detail supplied.'} ${d.remediation ?? ''}`
    : (value.code ?? 'profile_request_failed');
};
const modeLabel: Record<TravelRule['transportMode'], string> = {
  walking: 'Walking',
  cycling: 'Cycling',
  public_transport: 'Public transport',
  driving: 'Driving',
  other: 'Other',
};

export default function PersonalProfileForm() {
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [activeDay, setActiveDay] = useState(0);
  const [reauthRequired, setReauthRequired] = useState(false);
  const daysForForm = useMemo(
    () => (profile.timePreferences.length === 7 ? profile.timePreferences : emptyDays()),
    [profile.timePreferences],
  );
  useEffect(() => {
    let active = true;
    fetch('/api/personal/profile')
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(prettyError(payload));
        return payload as {
          profile: Record<string, unknown> | null;
          locations: Location[];
          travelRules: TravelRule[];
          preparationRules: PreparationRule[];
          timePreferences: Day[];
          commitments: Commitment[];
          routines: Routine[];
        };
      })
      .then((payload) => {
        if (!active) return;
        const defaults = emptyProfile();
        const preferences = (payload.profile?.planningPreferences ?? {}) as Partial<Preferences>;
        setProfile({
          ...defaults,
          dateOfBirth: (payload.profile?.dateOfBirth as string | null) ?? null,
          careerSummary: (payload.profile?.careerSummary as string) ?? '',
          preferences: { ...defaults.preferences, ...preferences },
          locations: payload.locations.map((location) => ({ ...location, address: '' })),
          travelRules: payload.travelRules ?? [],
          preparationRules: payload.preparationRules ?? [],
          timePreferences:
            payload.timePreferences.length === 7 ? payload.timePreferences : emptyDays(),
          commitments: payload.commitments ?? [],
          routines: payload.routines ?? [],
        });
        setLoaded(true);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'profile_read_failed');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const updatePreference = (key: keyof Preferences, value: string | number) =>
    setProfile((current) => ({
      ...current,
      preferences: { ...current.preferences, [key]: value },
    }));
  const updateDay = (weekday: number, key: keyof Omit<Day, 'weekday'>, value: string) =>
    setProfile((current) => ({
      ...current,
      timePreferences: current.timePreferences.map((day) =>
        day.weekday === weekday ? { ...day, [key]: asLines(value) } : day,
      ),
    }));
  const updateLocation = (index: number, patch: Partial<Location>) =>
    setProfile((current) => ({
      ...current,
      locations: current.locations.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    }));
  const updateTravelRule = (index: number, patch: Partial<TravelRule>) =>
    setProfile((current) => ({
      ...current,
      travelRules: current.travelRules.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    }));
  const updatePreparationRule = (index: number, patch: Partial<PreparationRule>) =>
    setProfile((current) => ({
      ...current,
      preparationRules: current.preparationRules.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    }));
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    setReauthRequired(false);
    try {
      const response = await fetch('/api/personal/profile', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...profile, timePreferences: daysForForm }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setReauthRequired(response.status === 401 && payload?.code === 'unauthorised');
        setError(prettyError(payload));
        return;
      }
      setSuccess(
        `Saved ${new Date(payload.savedAt).toLocaleString('en-GB')} · ${payload.changedSections.length} sections updated. Addresses remain encrypted and are never returned.`,
      );
      setLoaded(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'profile_save_failed');
    } finally {
      setSaving(false);
    }
  };
  if (loading)
    return (
      <section className="card" aria-busy="true">
        Loading Personal Operating Profile…
      </section>
    );
  return (
    <section className="stack" aria-label="Personal Operating Profile">
      <div className="card profile-hero">
        <p className="eyebrow">Personal planning</p>
        <h2>Personal Operating Profile</h2>
        <p className="label">
          Set the defaults and rules that help the planner understand your time. Travel belongs to a
          route between two locations; preparation is split into leaving and arrival time. Addresses
          are encrypted before storage and never returned.
        </p>
        {!loaded && !error ? (
          <p className="notice">No profile exists yet. Complete the sections below, then save.</p>
        ) : null}
        {error ? (
          <p role="alert" className="notice notice-error">
            {error}
          </p>
        ) : null}
        {reauthRequired ? (
          <div className="source-actions" aria-label="Session recovery">
            <p className="profile-helper">
              Your filled form is still in this tab. Sign in in a separate tab, complete MFA, then
              return here and click Save again; no page refresh is required.
            </p>
            <button
              type="button"
              onClick={() =>
                window.open('/login?returnTo=/personal', '_blank', 'noopener,noreferrer')
              }
            >
              Open sign-in in a new tab
            </button>
          </div>
        ) : null}
        {success ? (
          <p role="status" className="notice notice-success">
            {success}
          </p>
        ) : null}
      </div>
      <form className="stack" onSubmit={save}>
        <fieldset className="card stack profile-section">
          <legend>1. Planning defaults</legend>
          <p className="profile-helper">
            These are global defaults. A route can override its own buffer when it has different
            traffic or reliability.
          </p>
          <div className="grid">
            <label>
              Normal work start
              <input
                type="time"
                value={profile.preferences.normalWorkStart}
                onChange={(e) => updatePreference('normalWorkStart', e.target.value)}
              />
            </label>
            <label>
              Normal work end
              <input
                type="time"
                value={profile.preferences.normalWorkEnd}
                onChange={(e) => updatePreference('normalWorkEnd', e.target.value)}
              />
            </label>
            <label>
              Quiet hours start
              <input
                type="time"
                value={profile.preferences.quietStart}
                onChange={(e) => updatePreference('quietStart', e.target.value)}
              />
            </label>
            <label>
              Quiet hours end
              <input
                type="time"
                value={profile.preferences.quietEnd}
                onChange={(e) => updatePreference('quietEnd', e.target.value)}
              />
            </label>
          </div>
          <div className="grid">
            <label>
              Maximum focus block (minutes)
              <input
                type="number"
                min={15}
                max={480}
                value={profile.preferences.maximumFocusDurationMinutes}
                onChange={(e) =>
                  updatePreference('maximumFocusDurationMinutes', Number(e.target.value))
                }
              />
            </label>
            <label>
              Protected unscheduled gap (minutes)
              <span className="profile-helper">Space kept between commitments.</span>
              <input
                type="number"
                min={0}
                max={1440}
                value={profile.preferences.minimumUnscheduledBufferMinutes}
                onChange={(e) =>
                  updatePreference('minimumUnscheduledBufferMinutes', Number(e.target.value))
                }
              />
            </label>
            <label>
              Evening wind-down buffer (minutes)
              <span className="profile-helper">Space protected before quiet hours.</span>
              <input
                type="number"
                min={0}
                max={1440}
                value={profile.preferences.minimumEveningBufferMinutes}
                onChange={(e) =>
                  updatePreference('minimumEveningBufferMinutes', Number(e.target.value))
                }
              />
            </label>
            <label>
              Default travel buffer (%)
              <span className="profile-helper">Applied on top of route time.</span>
              <input
                type="number"
                min={0}
                max={200}
                step="0.5"
                value={profile.preferences.travelBufferPercent}
                onChange={(e) => updatePreference('travelBufferPercent', Number(e.target.value))}
              />
            </label>
            <label>
              Minimum travel buffer (minutes)
              <span className="profile-helper">The floor when a percentage is small.</span>
              <input
                type="number"
                min={0}
                max={120}
                value={profile.preferences.minimumTravelBufferMinutes}
                onChange={(e) =>
                  updatePreference('minimumTravelBufferMinutes', Number(e.target.value))
                }
              />
            </label>
            <label>
              Preparation default before leaving (minutes)
              <span className="profile-helper">Fallback when a location has no specific rule.</span>
              <input
                type="number"
                min={0}
                max={240}
                value={profile.preferences.preparationBufferMinutes}
                onChange={(e) =>
                  updatePreference('preparationBufferMinutes', Number(e.target.value))
                }
              />
            </label>
          </div>
          <label>
            Usual transport modes
            <input
              value={profile.preferences.transportPreferences}
              onChange={(e) => updatePreference('transportPreferences', e.target.value)}
              placeholder="Walking, public transport"
            />
          </label>
        </fieldset>
        <fieldset className="card stack profile-section">
          <legend>2. Approved locations</legend>
          <p className="profile-helper">
            Locations are identities and encrypted addresses only. Add travel time in the route
            rules below.
          </p>
          {profile.locations.map((location, index) => (
            <div className="profile-row card" key={location.id}>
              <div className="grid">
                <label>
                  Label
                  <input
                    value={location.label}
                    onChange={(e) => updateLocation(index, { label: e.target.value })}
                  />
                </label>
                <label>
                  Type
                  <select
                    value={location.kind}
                    onChange={(e) =>
                      updateLocation(index, { kind: e.target.value as Location['kind'] })
                    }
                  >
                    <option value="home">Home</option>
                    <option value="work">Work</option>
                    <option value="common">Common</option>
                  </select>
                </label>
              </div>
              <label>
                {location.hasAddress
                  ? 'Replace address (leave blank to retain encrypted address)'
                  : 'Address'}
                <input
                  value={location.address}
                  onChange={(e) => updateLocation(index, { address: e.target.value })}
                  autoComplete="street-address"
                />
              </label>
              <button
                type="button"
                onClick={() =>
                  setProfile((current) => ({
                    ...current,
                    locations: current.locations.filter((_, itemIndex) => itemIndex !== index),
                    travelRules: current.travelRules.filter(
                      (rule) =>
                        rule.originLocationId !== location.id &&
                        rule.destinationLocationId !== location.id,
                    ),
                    preparationRules: current.preparationRules.filter(
                      (rule) => rule.locationId !== location.id,
                    ),
                  }))
                }
              >
                Remove location
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setProfile((current) => ({
                ...current,
                locations: [
                  ...current.locations,
                  { id: crypto.randomUUID(), label: '', kind: 'common', address: '' },
                ],
              }))
            }
          >
            Add location
          </button>
        </fieldset>
        <fieldset className="card stack profile-section">
          <legend>3. Preparation by location</legend>
          <p className="profile-helper">
            “Prepare before leaving” is time at your current location. “Settle in after arrival” is
            time needed at the destination before the appointment or task starts.
          </p>
          {profile.locations.length === 0 ? (
            <p className="notice">Add a location first.</p>
          ) : (
            profile.preparationRules.map((rule, index) => (
              <div className="profile-row card grid" key={rule.id ?? rule.locationId}>
                <label>
                  Location
                  <select
                    value={rule.locationId}
                    onChange={(e) => updatePreparationRule(index, { locationId: e.target.value })}
                  >
                    {profile.locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.label || 'Unnamed location'}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Prepare before leaving (minutes)
                  <input
                    type="number"
                    min={0}
                    max={240}
                    value={rule.prepareBeforeDepartureMinutes}
                    onChange={(e) =>
                      updatePreparationRule(index, {
                        prepareBeforeDepartureMinutes: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Settle in after arrival (minutes)
                  <input
                    type="number"
                    min={0}
                    max={240}
                    value={rule.settleAfterArrivalMinutes}
                    onChange={(e) =>
                      updatePreparationRule(index, {
                        settleAfterArrivalMinutes: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setProfile((current) => ({
                      ...current,
                      preparationRules: current.preparationRules.filter(
                        (_, itemIndex) => itemIndex !== index,
                      ),
                    }))
                  }
                >
                  Remove rule
                </button>
              </div>
            ))
          )}
          <button
            type="button"
            disabled={!profile.locations.length}
            onClick={() =>
              setProfile((current) => ({
                ...current,
                preparationRules: [
                  ...current.preparationRules,
                  {
                    locationId: current.locations[0]!.id,
                    prepareBeforeDepartureMinutes: current.preferences.preparationBufferMinutes,
                    settleAfterArrivalMinutes: 0,
                  },
                ],
              }))
            }
          >
            Add preparation rule
          </button>
        </fieldset>
        <fieldset className="card stack profile-section">
          <legend>4. Travel rules between locations</legend>
          <p className="profile-helper">
            Travel depends on origin, destination, mode, and time of day. The planner uses the peak
            time during the peak window, then adds the larger of the percentage buffer or minimum
            buffer.
          </p>
          {profile.locations.length < 2 ? (
            <p className="notice">Add at least two locations to define a route.</p>
          ) : (
            profile.travelRules.map((rule, index) => {
              const base = Math.max(rule.normalMinutes, rule.peakMinutes);
              const buffered = Math.ceil(
                base * (1 + rule.bufferPercent / 100) + rule.minimumBufferMinutes,
              );
              return (
                <div
                  className="profile-row card stack"
                  key={rule.id ?? `${rule.originLocationId}-${rule.destinationLocationId}-${index}`}
                >
                  <div className="grid">
                    <label>
                      From
                      <select
                        value={rule.originLocationId}
                        onChange={(e) =>
                          updateTravelRule(index, { originLocationId: e.target.value })
                        }
                      >
                        {profile.locations.map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.label || 'Unnamed location'}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      To
                      <select
                        value={rule.destinationLocationId}
                        onChange={(e) =>
                          updateTravelRule(index, { destinationLocationId: e.target.value })
                        }
                      >
                        {profile.locations.map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.label || 'Unnamed location'}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Mode
                      <select
                        value={rule.transportMode}
                        onChange={(e) =>
                          updateTravelRule(index, {
                            transportMode: e.target.value as TravelRule['transportMode'],
                          })
                        }
                      >
                        {Object.entries(modeLabel).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="grid">
                    <label>
                      Normal minutes
                      <input
                        type="number"
                        min={1}
                        max={1440}
                        value={rule.normalMinutes}
                        onChange={(e) =>
                          updateTravelRule(index, { normalMinutes: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label>
                      Peak minutes
                      <input
                        type="number"
                        min={1}
                        max={1440}
                        value={rule.peakMinutes}
                        onChange={(e) =>
                          updateTravelRule(index, { peakMinutes: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label>
                      Peak starts
                      <input
                        type="time"
                        value={rule.peakStart ?? ''}
                        onChange={(e) =>
                          updateTravelRule(index, { peakStart: e.target.value || null })
                        }
                      />
                    </label>
                    <label>
                      Peak ends
                      <input
                        type="time"
                        value={rule.peakEnd ?? ''}
                        onChange={(e) =>
                          updateTravelRule(index, { peakEnd: e.target.value || null })
                        }
                      />
                    </label>
                    <label>
                      Route buffer (%)
                      <input
                        type="number"
                        min={0}
                        max={200}
                        step="0.5"
                        value={rule.bufferPercent}
                        onChange={(e) =>
                          updateTravelRule(index, { bufferPercent: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label>
                      Minimum buffer (minutes)
                      <input
                        type="number"
                        min={0}
                        max={120}
                        value={rule.minimumBufferMinutes}
                        onChange={(e) =>
                          updateTravelRule(index, { minimumBufferMinutes: Number(e.target.value) })
                        }
                      />
                    </label>
                  </div>
                  <p className="profile-route-preview" role="status">
                    Planner allowance: <strong>{buffered} minutes</strong> at peak (base {base} +
                    buffer).
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setProfile((current) => ({
                        ...current,
                        travelRules: current.travelRules.filter(
                          (_, itemIndex) => itemIndex !== index,
                        ),
                      }))
                    }
                  >
                    Remove route
                  </button>
                </div>
              );
            })
          )}
          <button
            type="button"
            disabled={profile.locations.length < 2}
            onClick={() =>
              setProfile((current) => ({
                ...current,
                travelRules: [
                  ...current.travelRules,
                  {
                    originLocationId: current.locations[0]!.id,
                    destinationLocationId: current.locations[1]!.id,
                    transportMode: 'public_transport',
                    normalMinutes: 30,
                    peakMinutes: 40,
                    peakStart: '07:30',
                    peakEnd: '09:30',
                    bufferPercent: current.preferences.travelBufferPercent,
                    minimumBufferMinutes: current.preferences.minimumTravelBufferMinutes,
                  },
                ],
              }))
            }
          >
            Add travel rule
          </button>
        </fieldset>
        <fieldset className="card stack profile-section">
          <legend>5. Weekly availability</legend>
          <p className="profile-helper">
            One window per line, using HH:MM-HH:MM. Select a day to keep this section compact and
            easy to scan.
          </p>
          <div className="profile-day-tabs" role="tablist" aria-label="Weekdays">
            {days.map((day, weekday) => (
              <button
                type="button"
                role="tab"
                aria-selected={activeDay === weekday}
                className={activeDay === weekday ? 'active' : ''}
                key={day}
                onClick={() => setActiveDay(weekday)}
              >
                {day.slice(0, 3)}
              </button>
            ))}
          </div>
          {daysForForm[activeDay] ? (
            <div className="grid profile-day-grid">
              <strong>{days[activeDay]}</strong>
              <label>
                Focus windows
                <textarea
                  rows={3}
                  value={asText(daysForForm[activeDay].preferredFocusWindows)}
                  onChange={(e) => updateDay(activeDay, 'preferredFocusWindows', e.target.value)}
                  placeholder="09:00-11:00"
                />
              </label>
              <label>
                Guaranteed busy
                <textarea
                  rows={3}
                  value={asText(daysForForm[activeDay].guaranteedBusyWindows)}
                  onChange={(e) => updateDay(activeDay, 'guaranteedBusyWindows', e.target.value)}
                  placeholder="13:00-14:00"
                />
              </label>
              <label>
                Exercise windows
                <textarea
                  rows={3}
                  value={asText(daysForForm[activeDay].preferredTrainingWindows)}
                  onChange={(e) => updateDay(activeDay, 'preferredTrainingWindows', e.target.value)}
                  placeholder="18:00-19:00"
                />
              </label>
            </div>
          ) : null}
        </fieldset>
        <fieldset className="card stack profile-section">
          <legend>6. Commitments and routines</legend>
          <p className="profile-helper">
            Optional recurring context. These rows remain private and are saved idempotently.
          </p>
          {profile.commitments.map((item, index) => (
            <div className="profile-row grid" key={item.id}>
              <label>
                Commitment
                <input
                  value={item.title}
                  onChange={(e) =>
                    setProfile((current) => ({
                      ...current,
                      commitments: current.commitments.map((entry, i) =>
                        i === index ? { ...entry, title: e.target.value } : entry,
                      ),
                    }))
                  }
                />
              </label>
              <label>
                Due date
                <input
                  type="datetime-local"
                  value={item.dueAt?.slice(0, 16) ?? ''}
                  onChange={(e) =>
                    setProfile((current) => ({
                      ...current,
                      commitments: current.commitments.map((entry, i) =>
                        i === index
                          ? {
                              ...entry,
                              dueAt: e.target.value ? new Date(e.target.value).toISOString() : null,
                            }
                          : entry,
                      ),
                    }))
                  }
                />
              </label>
              <button
                type="button"
                onClick={() =>
                  setProfile((current) => ({
                    ...current,
                    commitments: current.commitments.filter((_, i) => i !== index),
                  }))
                }
              >
                Remove commitment
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setProfile((current) => ({
                ...current,
                commitments: [
                  ...current.commitments,
                  {
                    id: crypto.randomUUID(),
                    title: '',
                    dueAt: null,
                    importance: 3,
                    status: 'open',
                  },
                ],
              }))
            }
          >
            Add commitment
          </button>
          {profile.routines.map((item, index) => (
            <div className="profile-row grid" key={item.id}>
              <label>
                Routine
                <input
                  value={item.title}
                  onChange={(e) =>
                    setProfile((current) => ({
                      ...current,
                      routines: current.routines.map((entry, i) =>
                        i === index ? { ...entry, title: e.target.value } : entry,
                      ),
                    }))
                  }
                />
              </label>
              <label>
                Cadence
                <input
                  value={item.cadence}
                  onChange={(e) =>
                    setProfile((current) => ({
                      ...current,
                      routines: current.routines.map((entry, i) =>
                        i === index ? { ...entry, cadence: e.target.value } : entry,
                      ),
                    }))
                  }
                />
              </label>
              <button
                type="button"
                onClick={() =>
                  setProfile((current) => ({
                    ...current,
                    routines: current.routines.filter((_, i) => i !== index),
                  }))
                }
              >
                Remove routine
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setProfile((current) => ({
                ...current,
                routines: [
                  ...current.routines,
                  {
                    id: crypto.randomUUID(),
                    title: '',
                    cadence: 'daily',
                    preferredWindow: {},
                    active: true,
                  },
                ],
              }))
            }
          >
            Add routine
          </button>
        </fieldset>
        <fieldset className="card stack profile-section">
          <legend>About you</legend>
          <label>
            Date of birth
            <input
              type="date"
              value={profile.dateOfBirth ?? ''}
              onChange={(e) =>
                setProfile((current) => ({ ...current, dateOfBirth: e.target.value || null }))
              }
            />
          </label>
          <label>
            Current ambitions and projects
            <textarea
              rows={4}
              value={profile.careerSummary}
              onChange={(e) =>
                setProfile((current) => ({ ...current, careerSummary: e.target.value }))
              }
              placeholder="Projects, ambitions, and career context"
            />
          </label>
        </fieldset>
        <button type="submit" disabled={saving}>
          {saving ? 'Saving securely…' : 'Save all profile sections'}
        </button>
      </form>
    </section>
  );
}
