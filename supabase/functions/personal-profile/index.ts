import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { consumeRateLimit } from "../_shared/rate-limit.ts";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const service = createClient(url, serviceKey);
const route = "/functions/v1/personal-profile";
const allowedEmail = "matthewirving99@gmail.com";

type Diagnostic = {
  code: string;
  stage: string;
  httpStatus: number;
  requestId: string;
  detail: string;
  remediation: string;
  route?: string;
  method?: string;
  missing?: string[];
};

const json = (body: unknown, status = 200, requestId?: string) => {
  const value = body as Record<string, unknown>;
  const headers = new Headers({ "content-type": "application/json" });
  if (requestId) headers.set("x-request-id", requestId);
  return new Response(JSON.stringify(value), { status, headers });
};

const failure = (
  requestId: string,
  code: string,
  stage: string,
  httpStatus: number,
  detail: string,
  remediation: string,
  missing?: string[],
) =>
  json(
    {
      code,
      diagnostic: {
        code,
        stage,
        httpStatus,
        requestId,
        route,
        method: "GET or PUT",
        detail,
        remediation,
        ...(missing ? { missing } : {}),
      } satisfies Diagnostic,
      requestId,
    },
    httpStatus,
    requestId,
  );

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isUuid = (value: unknown) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
const isTime = (value: unknown) =>
  typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const isWindow = (value: unknown) =>
  typeof value === "string" &&
  /^(?:[01]\d|2[0-3]):[0-5]\d-(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const boundedString = (value: unknown, max: number) =>
  typeof value === "string" && value.trim().length <= max;
const boundedNumber = (value: unknown, min: number, max: number) =>
  typeof value === "number" && Number.isInteger(value) && value >= min &&
  value <= max;

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};
const base64ToBytes = (value: string) => {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};
const encryptAddress = async (address: string) => {
  const raw = Deno.env.get("APP_TOKEN_ENCRYPTION_KEY");
  if (!raw) throw new Error("encryption_unconfigured");
  let keyBytes: Uint8Array;
  try {
    keyBytes = base64ToBytes(raw);
  } catch {
    throw new Error("encryption_key_invalid");
  }
  if (keyBytes.byteLength !== 32) throw new Error("encryption_key_invalid");
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes.buffer as ArrayBuffer,
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(address),
  );
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(cipher))}`;
};

const validate = (body: unknown): string[] => {
  if (!isRecord(body)) return ["body must be an object"];
  const errors: string[] = [];
  if (
    body.dateOfBirth !== null && body.dateOfBirth !== undefined &&
    (typeof body.dateOfBirth !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(body.dateOfBirth))
  ) errors.push("dateOfBirth must be YYYY-MM-DD or null");
  if (
    body.careerSummary !== undefined && !boundedString(body.careerSummary, 4000)
  ) errors.push("careerSummary exceeds 4000 characters");
  if (!isRecord(body.preferences)) errors.push("preferences must be an object");
  const locations = body.locations;
  if (!Array.isArray(locations) || locations.length > 20) {
    errors.push("locations must be an array of at most 20 items");
  } else {locations.forEach((location, index) => {
      if (!isRecord(location)) {
        return errors.push(`locations[${index}] must be an object`);
      }
      if (location.id !== undefined && !isUuid(location.id)) {
        errors.push(`locations[${index}].id is not a UUID`);
      }
      if (
        !boundedString(location.label, 100) ||
        !String(location.label ?? "").trim()
      ) {
        errors.push(
          `locations[${index}].label is required and must be <=100 characters`,
        );
      }
      if (!["home", "work", "common"].includes(String(location.kind))) {
        errors.push(`locations[${index}].kind must be home, work, or common`);
      }
      if (
        location.address !== undefined && !boundedString(location.address, 500)
      ) errors.push(`locations[${index}].address exceeds 500 characters`);
      if (!boundedNumber(location.travelMinutes ?? 0, 0, 1440)) {
        errors.push(`locations[${index}].travelMinutes must be 0..1440`);
      }
      if (!boundedNumber(location.preparationMinutes ?? 0, 0, 1440)) {
        errors.push(`locations[${index}].preparationMinutes must be 0..1440`);
      }
    });}
  const preferences = isRecord(body.preferences) ? body.preferences : {};
  for (
    const field of [
      "normalWorkStart",
      "normalWorkEnd",
      "quietStart",
      "quietEnd",
    ]
  ) {
    if (preferences[field] !== undefined && !isTime(preferences[field])) {
      errors.push(`preferences.${field} must be HH:MM`);
    }
  }
  for (
    const field of [
      "maximumFocusDurationMinutes",
      "minimumUnscheduledBufferMinutes",
      "minimumEveningBufferMinutes",
      "preparationBufferMinutes",
      "travelBufferMinutes",
    ]
  ) {
    if (
      preferences[field] !== undefined &&
      !boundedNumber(preferences[field], 0, 1440)
    ) errors.push(`preferences.${field} must be an integer from 0 to 1440`);
  }
  if (
    preferences.maximumFocusDurationMinutes !== undefined &&
    !boundedNumber(preferences.maximumFocusDurationMinutes, 15, 480)
  ) errors.push("preferences.maximumFocusDurationMinutes must be 15..480");
  const timePreferences = body.timePreferences;
  if (!Array.isArray(timePreferences) || timePreferences.length !== 7) {
    errors.push(
      "timePreferences must contain exactly one entry for each weekday (0-6)",
    );
  } else {timePreferences.forEach((item, index) => {
      if (!isRecord(item) || item.weekday !== index) {
        errors.push(`timePreferences[${index}].weekday must be ${index}`);
      }
      if (!isRecord(item)) return;
      for (
        const field of [
          "preferredFocusWindows",
          "guaranteedBusyWindows",
          "preferredTrainingWindows",
        ]
      ) {
        if (
          !Array.isArray(item[field]) || item[field].length > 20 ||
          item[field].some((window) => !isWindow(window))
        ) {
          errors.push(
            `timePreferences[${index}].${field} contains an invalid window`,
          );
        }
      }
    });}
  const commitments = body.commitments;
  if (!Array.isArray(commitments) || commitments.length > 100) {
    errors.push("commitments must be an array of at most 100 items");
  } else {commitments.forEach((item, index) => {
      if (!isRecord(item) || !isUuid(item.id)) {
        errors.push(`commitments[${index}].id must be a UUID`);
      } else if (
        !boundedString(item.title, 200) || !String(item.title ?? "").trim()
      ) {
        errors.push(
          `commitments[${index}].title is required and must be <=200 characters`,
        );
      }
      if (isRecord(item) && !boundedNumber(item.importance ?? 3, 1, 5)) {
        errors.push(`commitments[${index}].importance must be 1..5`);
      }
    });}
  const routines = body.routines;
  if (!Array.isArray(routines) || routines.length > 100) {
    errors.push("routines must be an array of at most 100 items");
  } else {routines.forEach((item, index) => {
      if (!isRecord(item) || !isUuid(item.id)) {
        errors.push(`routines[${index}].id must be a UUID`);
      } else if (
        !boundedString(item.title, 200) || !String(item.title ?? "").trim()
      ) {
        errors.push(
          `routines[${index}].title is required and must be <=200 characters`,
        );
      }
      if (isRecord(item) && !boundedString(item.cadence, 100)) {
        errors.push(`routines[${index}].cadence exceeds 100 characters`);
      }
    });}
  return errors;
};

const authUser = async (request: Request, requestId: string) => {
  const token = request.headers.get("authorization");
  if (!token?.startsWith("Bearer ")) {
    return {
      error: failure(
        requestId,
        "unauthorised",
        "authentication",
        401,
        "No bearer access token was supplied.",
        "Sign in again and retry.",
      ),
    };
  }
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: token } },
  });
  const { data, error } = await caller.auth.getUser();
  if (error || !data.user) {
    return {
      error: failure(
        requestId,
        "auth_user_lookup_failed",
        "authentication",
        401,
        "Supabase could not validate the authenticated session.",
        "Sign in again; if this repeats, inspect the request ID in the server logs.",
      ),
    };
  }
  if (data.user.email?.toLowerCase() !== allowedEmail) {
    return {
      error: failure(
        requestId,
        "account_not_allowed",
        "authorisation",
        403,
        "The authenticated account is not the configured AI Operations operator account.",
        "Sign in with the approved operator account.",
      ),
    };
  }
  const { data: allowed, error: aalError } = await caller.rpc(
    "is_allowed_aal2",
  );
  if (aalError) {
    return {
      error: failure(
        requestId,
        "auth_aal2_check_failed",
        "authorisation",
        503,
        `The fresh-MFA authorisation check failed (${
          aalError.code ?? "provider_error"
        }).`,
        "Complete fresh MFA and retry; if it repeats, use the request ID to inspect Supabase logs.",
      ),
    };
  }
  if (!allowed) {
    return {
      error: failure(
        requestId,
        "fresh_mfa_required",
        "authorisation",
        403,
        "A fresh AAL2 session is required to edit the personal operating profile.",
        "Complete the Microsoft Authenticator challenge, then retry.",
      ),
    };
  }
  return { user: data.user };
};

const sanitise = (
  profile: Record<string, unknown> | null,
  locations: Record<string, unknown>[],
  timePreferences: Record<string, unknown>[],
  commitments: Record<string, unknown>[],
  routines: Record<string, unknown>[],
) => ({
  profile: profile
    ? {
      dateOfBirth: profile.date_of_birth,
      careerSummary: profile.career_summary ?? "",
      planningPreferences: profile.planning_preferences ?? {},
      updatedAt: profile.updated_at,
    }
    : null,
  locations: locations.map((location) => ({
    id: location.id,
    label: location.label,
    kind: location.location_kind,
    hasAddress: Boolean(location.encrypted_address),
    travelMinutes: location.default_travel_minutes,
    preparationMinutes: location.default_preparation_minutes,
  })),
  timePreferences: timePreferences.map((item) => ({
    weekday: item.weekday,
    preferredFocusWindows: item.preferred_focus_windows ?? [],
    guaranteedBusyWindows: item.guaranteed_busy_windows ?? [],
    preferredTrainingWindows: item.preferred_training_windows ?? [],
  })),
  commitments: commitments.map((item) => ({
    id: item.id,
    title: item.title,
    dueAt: item.due_at,
    importance: item.importance,
    status: item.status,
  })),
  routines: routines.map((item) => ({
    id: item.id,
    title: item.title,
    cadence: item.cadence,
    preferredWindow: item.preferred_window ?? {},
    active: item.active,
  })),
});

Deno.serve(async (request) => {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  if (request.method !== "GET" && request.method !== "PUT") {
    return failure(
      requestId,
      "method_not_allowed",
      "request",
      405,
      `Method ${request.method} is not supported.`,
      "Use GET to read or PUT to save the profile.",
    );
  }
  const auth = await authUser(request, requestId);
  if (auth.error || !auth.user) return auth.error;
  if (!await consumeRateLimit(auth.user.id, "personal_profile", 30)) {
    return failure(
      requestId,
      "rate_limited",
      "rate_limit",
      429,
      "Too many profile requests were received.",
      "Wait briefly and retry once.",
    );
  }

  if (request.method === "GET") {
    const [profile, locations, timePreferences, commitments, routines] =
      await Promise.all([
        service.from("personal_profiles").select(
          "user_id,date_of_birth,home_location_id,work_location_id,career_summary,planning_preferences,notification_preferences,privacy_preferences,updated_at",
        ).eq("user_id", auth.user.id).maybeSingle(),
        service.from("personal_locations").select(
          "id,label,location_kind,encrypted_address,default_travel_minutes,default_preparation_minutes",
        ).eq("user_id", auth.user.id).order("label"),
        service.from("time_preferences").select(
          "weekday,preferred_focus_windows,guaranteed_busy_windows,preferred_training_windows,quiet_hours,maximum_focus_duration_minutes,minimum_unscheduled_buffer_minutes,minimum_evening_buffer_minutes,transport_preferences",
        ).eq("user_id", auth.user.id).order("weekday"),
        service.from("commitments").select("id,title,due_at,importance,status")
          .eq("user_id", auth.user.id).order("due_at", {
            ascending: true,
            nullsFirst: false,
          }),
        service.from("routines").select(
          "id,title,cadence,preferred_window,active",
        ).eq("user_id", auth.user.id).order("title"),
      ]);
    const failed = [profile, locations, timePreferences, commitments, routines]
      .find((result) => result.error);
    if (failed?.error) {
      return failure(
        requestId,
        "profile_read_failed",
        "persistence.read",
        500,
        `The profile could not be read (${
          failed.error.code ?? "database_error"
        }).`,
        "Retry once; if it repeats, provide the request ID to support.",
      );
    }
    return json(
      {
        ...sanitise(
          profile.data as Record<string, unknown> | null,
          locations.data as Record<string, unknown>[],
          timePreferences.data as Record<string, unknown>[],
          commitments.data as Record<string, unknown>[],
          routines.data as Record<string, unknown>[],
        ),
        requestId,
      },
      200,
      requestId,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure(
      requestId,
      "invalid_json",
      "request.parse",
      400,
      "The request body is not valid JSON.",
      "Retry from the Personal page without modifying the request.",
    );
  }
  const validationErrors = validate(body);
  if (validationErrors.length) {
    return failure(
      requestId,
      "invalid_profile_request",
      "request.validation",
      400,
      validationErrors.slice(0, 8).join("; "),
      "Correct the highlighted fields and submit again.",
      validationErrors,
    );
  }
  const input = body as Record<string, unknown>;
  const preferences = input.preferences as Record<string, unknown>;
  const locations = input.locations as Record<string, unknown>[];
  const timePreferences = input.timePreferences as Record<string, unknown>[];
  const commitments = input.commitments as Record<string, unknown>[];
  const routines = input.routines as Record<string, unknown>[];
  const existingLocations = await service.from("personal_locations").select(
    "id,label,encrypted_address",
  ).eq("user_id", auth.user.id);
  if (existingLocations.error) {
    return failure(
      requestId,
      "profile_read_failed",
      "persistence.read_locations",
      500,
      `Existing locations could not be loaded (${
        existingLocations.error.code ?? "database_error"
      }).`,
      "Retry once; if it repeats, provide the request ID to support.",
    );
  }
  const existingById = new Map(
    (existingLocations.data ?? []).map((
      location,
    ) => [location.id as string, location]),
  );
  const encryptedLocations: Record<string, unknown>[] = [];
  try {
    for (const location of locations) {
      const existing = typeof location.id === "string"
        ? existingById.get(location.id)
        : undefined;
      const address =
        typeof location.address === "string" && location.address.trim()
          ? location.address.trim()
          : undefined;
      if (!existing && !address) {
        throw new Error("new_location_address_required");
      }
      encryptedLocations.push({
        ...(location.id ? { id: location.id } : {}),
        user_id: auth.user.id,
        label: String(location.label).trim(),
        location_kind: location.kind,
        encrypted_address: address
          ? await encryptAddress(address)
          : existing?.encrypted_address,
        default_travel_minutes: location.travelMinutes,
        default_preparation_minutes: location.preparationMinutes,
      });
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "encryption_failed";
    if (code === "new_location_address_required") {
      return failure(
        requestId,
        "location_address_required",
        "locations.validation",
        400,
        "A new approved location must include an address.",
        "Enter the address once; it will be encrypted and never returned to the browser.",
      );
    }
    if (code === "encryption_unconfigured") {
      return failure(
        requestId,
        "encryption_unconfigured",
        "locations.encryption",
        503,
        "APP_TOKEN_ENCRYPTION_KEY is not configured in the control plane.",
        "Configure the production encryption key before saving sensitive locations.",
      );
    }
    return failure(
      requestId,
      code === "encryption_key_invalid" ? code : "location_encryption_failed",
      "locations.encryption",
      503,
      "The control plane could not encrypt an approved location.",
      "Do not retry repeatedly; inspect the key configuration using the request ID.",
    );
  }
  const now = new Date().toISOString();
  const profileWrite = await service.from("personal_profiles").upsert({
    user_id: auth.user.id,
    date_of_birth: input.dateOfBirth ?? null,
    career_summary: input.careerSummary ?? null,
    planning_preferences: preferences,
    updated_at: now,
  }, { onConflict: "user_id" }).select(
    "user_id,date_of_birth,home_location_id,work_location_id,career_summary,planning_preferences,notification_preferences,privacy_preferences,updated_at",
  ).single();
  if (profileWrite.error) {
    return failure(
      requestId,
      "profile_write_failed",
      "persistence.profile",
      500,
      `The profile record could not be saved (${
        profileWrite.error.code ?? "database_error"
      }).`,
      "Retry once; if it repeats, provide the request ID to support.",
    );
  }
  const locationWrite = encryptedLocations.length
    ? await service.from("personal_locations").upsert(encryptedLocations, {
      onConflict: "user_id,label",
    })
    : { error: null };
  if (locationWrite.error) {
    return failure(
      requestId,
      "locations_write_failed",
      "persistence.locations",
      500,
      `Approved locations could not be saved (${
        locationWrite.error.code ?? "database_error"
      }).`,
      "The profile was saved but locations were not; retry to finish the update.",
    );
  }
  const savedLocations = await service.from("personal_locations").select(
    "id,label,location_kind,encrypted_address,default_travel_minutes,default_preparation_minutes",
  ).eq("user_id", auth.user.id);
  if (savedLocations.error) {
    return failure(
      requestId,
      "locations_read_failed",
      "persistence.locations_read",
      500,
      `Saved locations could not be reloaded (${
        savedLocations.error.code ?? "database_error"
      }).`,
      "Retry once; do not create duplicate locations.",
    );
  }
  const home = savedLocations.data?.find((location) =>
    location.location_kind === "home"
  )?.id ?? null;
  const work = savedLocations.data?.find((location) =>
    location.location_kind === "work"
  )?.id ?? null;
  const profileLink = await service.from("personal_profiles").update({
    home_location_id: home,
    work_location_id: work,
    updated_at: now,
  }).eq("user_id", auth.user.id);
  if (profileLink.error) {
    return failure(
      requestId,
      "profile_location_link_failed",
      "persistence.profile_links",
      500,
      `Home/work location links could not be saved (${
        profileLink.error.code ?? "database_error"
      }).`,
      "Retry once; if it repeats, provide the request ID to support.",
    );
  }
  const preferenceWrite = await service.from("time_preferences").upsert(
    timePreferences.map((item) => ({
      user_id: auth.user.id,
      weekday: item.weekday,
      preferred_focus_windows: item.preferredFocusWindows,
      guaranteed_busy_windows: item.guaranteedBusyWindows,
      preferred_training_windows: item.preferredTrainingWindows,
      quiet_hours: { start: preferences.quietStart, end: preferences.quietEnd },
      maximum_focus_duration_minutes: preferences.maximumFocusDurationMinutes,
      minimum_unscheduled_buffer_minutes:
        preferences.minimumUnscheduledBufferMinutes,
      minimum_evening_buffer_minutes: preferences.minimumEveningBufferMinutes,
      transport_preferences: {
        mode: preferences.transportPreferences ?? "",
        preparationBufferMinutes: preferences.preparationBufferMinutes,
        travelBufferMinutes: preferences.travelBufferMinutes,
      },
      updated_at: now,
    })),
    { onConflict: "user_id,weekday" },
  );
  if (preferenceWrite.error) {
    return failure(
      requestId,
      "time_preferences_write_failed",
      "persistence.time_preferences",
      500,
      `Weekly planning preferences could not be saved (${
        preferenceWrite.error.code ?? "database_error"
      }).`,
      "The profile and locations were saved; retry to finish weekly preferences.",
    );
  }
  const commitmentWrite = await service.from("commitments").upsert(
    commitments.map((item) => ({
      id: item.id,
      user_id: auth.user.id,
      title: String(item.title).trim(),
      due_at: item.dueAt ?? null,
      importance: item.importance ?? 3,
      status: item.status ?? "open",
    })),
    { onConflict: "id" },
  );
  if (commitmentWrite.error) {
    return failure(
      requestId,
      "commitments_write_failed",
      "persistence.commitments",
      500,
      `Recurring commitments could not be saved (${
        commitmentWrite.error.code ?? "database_error"
      }).`,
      "The profile, locations, and weekly preferences were saved; retry commitments.",
    );
  }
  const routineWrite = await service.from("routines").upsert(
    routines.map((item) => ({
      id: item.id,
      user_id: auth.user.id,
      title: String(item.title).trim(),
      cadence: String(item.cadence).trim(),
      preferred_window: item.preferredWindow ?? {},
      active: item.active !== false,
    })),
    { onConflict: "id" },
  );
  if (routineWrite.error) {
    return failure(
      requestId,
      "routines_write_failed",
      "persistence.routines",
      500,
      `Routines could not be saved (${
        routineWrite.error.code ?? "database_error"
      }).`,
      "The rest of the profile was saved; retry routines.",
    );
  }
  await service.from("audit_events").insert({
    user_id: auth.user.id,
    actor_type: "user",
    action_type: "personal_profile_updated",
    target_type: "personal_profile",
    target_id: auth.user.id,
    aal: "aal2",
    result: "success",
    redacted_after: {
      sections: [
        "profile",
        "locations",
        "time_preferences",
        "commitments",
        "routines",
      ],
      locationCount: encryptedLocations.length,
      timePreferenceDays: timePreferences.length,
    },
  });
  const freshProfile = await service.from("personal_profiles").select(
    "user_id,date_of_birth,home_location_id,work_location_id,career_summary,planning_preferences,notification_preferences,privacy_preferences,updated_at",
  ).eq("user_id", auth.user.id).single();
  return json(
    {
      ...sanitise(
        freshProfile.data as Record<string, unknown>,
        savedLocations.data as Record<string, unknown>[],
        timePreferences,
        commitments,
        routines,
      ),
      savedAt: now,
      changedSections: [
        "profile",
        "locations",
        "time_preferences",
        "commitments",
        "routines",
      ],
      requestId,
    },
    200,
    requestId,
  );
});
