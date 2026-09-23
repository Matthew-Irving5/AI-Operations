'use client';

import { useEffect, useMemo, useState } from 'react';

type Location = {
  id?: string;
  label: string;
  kind: 'home' | 'work' | 'common';
  address: string;
  hasAddress?: boolean;
  travelMinutes: number;
  preparationMinutes: number;
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
type Profile = {
  dateOfBirth: string | null;
  careerSummary: string;
  preferences: {
    normalWorkStart: string;
    normalWorkEnd: string;
    quietStart: string;
    quietEnd: string;
    maximumFocusDurationMinutes: number;
    minimumUnscheduledBufferMinutes: number;
    minimumEveningBufferMinutes: number;
    preparationBufferMinutes: number;
    travelBufferMinutes: number;
    transportPreferences: string;
  };
  locations: Location[];
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
    travelBufferMinutes: 30,
    transportPreferences: 'walking, public transport',
  },
  locations: [],
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
  const diagnostic = value.diagnostic;
  if (!diagnostic) return value.code ?? 'profile_request_failed';
  return `${value.code ?? 'profile_request_failed'} · stage ${diagnostic.stage ?? 'unknown'} · HTTP ${diagnostic.httpStatus ?? 'n/a'} · request ${diagnostic.requestId ?? 'unknown'} — ${diagnostic.detail ?? 'No detail supplied.'} ${diagnostic.remediation ?? ''}`;
};

export default function PersonalProfileForm() {
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
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
          timePreferences: Day[];
          commitments: Commitment[];
          routines: Routine[];
        };
      })
      .then((payload) => {
        if (!active) return;
        const preferences = (payload.profile?.planningPreferences ?? {}) as Partial<
          Profile['preferences']
        >;
        setProfile({
          ...emptyProfile(),
          dateOfBirth: (payload.profile?.dateOfBirth as string | null) ?? null,
          careerSummary: (payload.profile?.careerSummary as string) ?? '',
          preferences: { ...emptyProfile().preferences, ...preferences },
          locations: payload.locations.map((location) => ({ ...location, address: '' })),
          timePreferences:
            payload.timePreferences.length === 7 ? payload.timePreferences : emptyDays(),
          commitments: payload.commitments,
          routines: payload.routines,
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

  const updatePreference = (key: keyof Profile['preferences'], value: string | number) =>
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
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    const response = await fetch('/api/personal/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...profile, timePreferences: daysForForm }),
    });
    const payload = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) {
      setError(prettyError(payload));
      return;
    }
    setSuccess(
      `Saved ${new Date(payload.savedAt).toLocaleString('en-GB')} · ${payload.changedSections.length} sections updated. Addresses remain encrypted and are never returned.`,
    );
    setLoaded(true);
  };
  if (loading)
    return (
      <section className="card" aria-busy="true">
        Loading Personal Operating Profile…
      </section>
    );
  return (
    <section className="stack" aria-label="Personal Operating Profile">
      <div className="card">
        <h2>Personal Operating Profile</h2>
        <p className="label">
          This is the planning context used by Personal Operations. Save only information you
          approve; addresses are encrypted before storage and never shown back.
        </p>
        {!loaded && !error ? (
          <p className="notice">No profile exists yet. Complete the fields below, then save.</p>
        ) : null}
        {error ? (
          <p role="alert" className="notice">
            {error}
          </p>
        ) : null}
        {success ? (
          <p role="status" className="notice">
            {success}
          </p>
        ) : null}
      </div>
      <form className="stack" onSubmit={save}>
        <fieldset className="card stack">
          <legend>Core planning context</legend>
          <label>
            Date of birth
            <input
              type="date"
              value={profile.dateOfBirth ?? ''}
              onChange={(event) =>
                setProfile((current) => ({ ...current, dateOfBirth: event.target.value || null }))
              }
            />
          </label>
          <label>
            Current ambitions and projects
            <textarea
              rows={4}
              value={profile.careerSummary}
              onChange={(event) =>
                setProfile((current) => ({ ...current, careerSummary: event.target.value }))
              }
              placeholder="Projects, ambitions, and career context"
            />
          </label>
          <div className="grid">
            <label>
              Normal work start
              <input
                type="time"
                value={profile.preferences.normalWorkStart}
                onChange={(event) => updatePreference('normalWorkStart', event.target.value)}
              />
            </label>
            <label>
              Normal work end
              <input
                type="time"
                value={profile.preferences.normalWorkEnd}
                onChange={(event) => updatePreference('normalWorkEnd', event.target.value)}
              />
            </label>
            <label>
              Quiet hours start
              <input
                type="time"
                value={profile.preferences.quietStart}
                onChange={(event) => updatePreference('quietStart', event.target.value)}
              />
            </label>
            <label>
              Quiet hours end
              <input
                type="time"
                value={profile.preferences.quietEnd}
                onChange={(event) => updatePreference('quietEnd', event.target.value)}
              />
            </label>
          </div>
          <div className="grid">
            <label>
              Transport preferences
              <input
                value={profile.preferences.transportPreferences}
                onChange={(event) => updatePreference('transportPreferences', event.target.value)}
              />
            </label>
            <label>
              Maximum focus block (minutes)
              <input
                type="number"
                min={15}
                max={480}
                value={profile.preferences.maximumFocusDurationMinutes}
                onChange={(event) =>
                  updatePreference('maximumFocusDurationMinutes', Number(event.target.value))
                }
              />
            </label>
            <label>
              Minimum unscheduled buffer (minutes)
              <input
                type="number"
                min={0}
                max={1440}
                value={profile.preferences.minimumUnscheduledBufferMinutes}
                onChange={(event) =>
                  updatePreference('minimumUnscheduledBufferMinutes', Number(event.target.value))
                }
              />
            </label>
            <label>
              Minimum evening buffer (minutes)
              <input
                type="number"
                min={0}
                max={1440}
                value={profile.preferences.minimumEveningBufferMinutes}
                onChange={(event) =>
                  updatePreference('minimumEveningBufferMinutes', Number(event.target.value))
                }
              />
            </label>
            <label>
              Preparation buffer (minutes)
              <input
                type="number"
                min={0}
                max={1440}
                value={profile.preferences.preparationBufferMinutes}
                onChange={(event) =>
                  updatePreference('preparationBufferMinutes', Number(event.target.value))
                }
              />
            </label>
            <label>
              Travel buffer (minutes)
              <input
                type="number"
                min={0}
                max={1440}
                value={profile.preferences.travelBufferMinutes}
                onChange={(event) =>
                  updatePreference('travelBufferMinutes', Number(event.target.value))
                }
              />
            </label>
          </div>
        </fieldset>
        <fieldset className="card stack">
          <legend>Approved locations</legend>
          <p className="label">
            Add at least one location. A new location needs its address once; existing encrypted
            addresses can be retained by leaving the address blank.
          </p>
          {profile.locations.map((location, index) => (
            <div className="card stack" key={location.id ?? index}>
              <div className="grid">
                <label>
                  Label
                  <input
                    value={location.label}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        locations: current.locations.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, label: event.target.value } : item,
                        ),
                      }))
                    }
                  />
                </label>
                <label>
                  Type
                  <select
                    value={location.kind}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        locations: current.locations.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, kind: event.target.value as Location['kind'] }
                            : item,
                        ),
                      }))
                    }
                  >
                    <option value="home">Home</option>
                    <option value="work">Work</option>
                    <option value="common">Common</option>
                  </select>
                </label>
                <label>
                  Travel minutes
                  <input
                    type="number"
                    min={0}
                    max={1440}
                    value={location.travelMinutes}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        locations: current.locations.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, travelMinutes: Number(event.target.value) }
                            : item,
                        ),
                      }))
                    }
                  />
                </label>
                <label>
                  Preparation minutes
                  <input
                    type="number"
                    min={0}
                    max={1440}
                    value={location.preparationMinutes}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        locations: current.locations.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, preparationMinutes: Number(event.target.value) }
                            : item,
                        ),
                      }))
                    }
                  />
                </label>
              </div>
              <label>
                {location.hasAddress
                  ? 'Replace address (leave blank to retain encrypted address)'
                  : 'Address'}
                <input
                  value={location.address}
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      locations: current.locations.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, address: event.target.value } : item,
                      ),
                    }))
                  }
                  autoComplete="street-address"
                />
              </label>
              <button
                type="button"
                onClick={() =>
                  setProfile((current) => ({
                    ...current,
                    locations: current.locations.filter((_, itemIndex) => itemIndex !== index),
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
                  {
                    label: '',
                    kind: 'common',
                    address: '',
                    travelMinutes: 0,
                    preparationMinutes: 0,
                  },
                ],
              }))
            }
          >
            Add location
          </button>
        </fieldset>
        <fieldset className="card stack">
          <legend>Weekly focus, busy, and exercise windows</legend>
          <p className="label">Enter one window per line in HH:MM-HH:MM format.</p>
          {daysForForm.map((day) => (
            <div className="grid" key={day.weekday}>
              <strong>{days[day.weekday]}</strong>
              <label>
                Focus
                <textarea
                  rows={2}
                  value={asText(day.preferredFocusWindows)}
                  onChange={(event) =>
                    updateDay(day.weekday, 'preferredFocusWindows', event.target.value)
                  }
                />
              </label>
              <label>
                Guaranteed busy
                <textarea
                  rows={2}
                  value={asText(day.guaranteedBusyWindows)}
                  onChange={(event) =>
                    updateDay(day.weekday, 'guaranteedBusyWindows', event.target.value)
                  }
                />
              </label>
              <label>
                Exercise
                <textarea
                  rows={2}
                  value={asText(day.preferredTrainingWindows)}
                  onChange={(event) =>
                    updateDay(day.weekday, 'preferredTrainingWindows', event.target.value)
                  }
                />
              </label>
            </div>
          ))}
        </fieldset>
        <fieldset className="card stack">
          <legend>Recurring commitments and routines</legend>
          <p className="label">
            These rows are saved idempotently using their local IDs; they are not sent to any
            external provider.
          </p>
          {profile.commitments.map((item, index) => (
            <div className="grid" key={item.id}>
              <label>
                Commitment
                <input
                  value={item.title}
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      commitments: current.commitments.map((entry, itemIndex) =>
                        itemIndex === index ? { ...entry, title: event.target.value } : entry,
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
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      commitments: current.commitments.map((entry, itemIndex) =>
                        itemIndex === index
                          ? {
                              ...entry,
                              dueAt: event.target.value
                                ? new Date(event.target.value).toISOString()
                                : null,
                            }
                          : entry,
                      ),
                    }))
                  }
                />
              </label>
              <label>
                Importance
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={item.importance}
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      commitments: current.commitments.map((entry, itemIndex) =>
                        itemIndex === index
                          ? { ...entry, importance: Number(event.target.value) }
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
                    commitments: current.commitments.filter((_, itemIndex) => itemIndex !== index),
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
            <div className="grid" key={item.id}>
              <label>
                Routine
                <input
                  value={item.title}
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      routines: current.routines.map((entry, itemIndex) =>
                        itemIndex === index ? { ...entry, title: event.target.value } : entry,
                      ),
                    }))
                  }
                />
              </label>
              <label>
                Cadence
                <input
                  value={item.cadence}
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      routines: current.routines.map((entry, itemIndex) =>
                        itemIndex === index ? { ...entry, cadence: event.target.value } : entry,
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
                    routines: current.routines.filter((_, itemIndex) => itemIndex !== index),
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
        <button type="submit" disabled={saving}>
          {saving ? 'Saving securely…' : 'Save Personal Operating Profile'}
        </button>
      </form>
    </section>
  );
}
