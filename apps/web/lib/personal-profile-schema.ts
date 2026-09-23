import { z } from 'zod';

const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');
const window = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d-(?:[01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM-HH:MM');
const uuid = z.string().uuid();

export const personalProfileSchema = z.object({
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  careerSummary: z.string().max(4000).optional(),
  preferences: z.object({
    normalWorkStart: time,
    normalWorkEnd: time,
    quietStart: time,
    quietEnd: time,
    maximumFocusDurationMinutes: z.number().int().min(15).max(480),
    minimumUnscheduledBufferMinutes: z.number().int().min(0).max(1440),
    minimumEveningBufferMinutes: z.number().int().min(0).max(1440),
    preparationBufferMinutes: z.number().int().min(0).max(1440),
    travelBufferPercent: z.number().min(0).max(200),
    minimumTravelBufferMinutes: z.number().int().min(0).max(120),
    transportPreferences: z.string().max(200),
  }),
  locations: z
    .array(
      z.object({
        id: uuid.optional(),
        label: z.string().min(1).max(100),
        kind: z.enum(['home', 'work', 'common']),
        address: z.string().max(500).optional(),
        hasAddress: z.boolean().optional(),
      }),
    )
    .max(20),
  travelRules: z
    .array(
      z.object({
        id: uuid.optional(),
        originLocationId: uuid,
        destinationLocationId: uuid,
        transportMode: z.enum(['walking', 'cycling', 'public_transport', 'driving', 'other']),
        normalMinutes: z.number().int().min(1).max(1440),
        peakMinutes: z.number().int().min(1).max(1440),
        peakStart: time.nullable().optional(),
        peakEnd: time.nullable().optional(),
        bufferPercent: z.number().min(0).max(200),
        minimumBufferMinutes: z.number().int().min(0).max(120),
      }),
    )
    .max(100),
  preparationRules: z
    .array(
      z.object({
        id: uuid.optional(),
        locationId: uuid,
        prepareBeforeDepartureMinutes: z.number().int().min(0).max(240),
        settleAfterArrivalMinutes: z.number().int().min(0).max(240),
      }),
    )
    .max(100),
  timePreferences: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        preferredFocusWindows: z.array(window).max(20),
        guaranteedBusyWindows: z.array(window).max(20),
        preferredTrainingWindows: z.array(window).max(20),
      }),
    )
    .length(7),
  commitments: z
    .array(
      z.object({
        id: uuid,
        title: z.string().min(1).max(200),
        dueAt: z.string().datetime().nullable().optional(),
        importance: z.number().int().min(1).max(5),
        status: z.enum(['open', 'completed', 'deferred']),
      }),
    )
    .max(100),
  routines: z
    .array(
      z.object({
        id: uuid,
        title: z.string().min(1).max(200),
        cadence: z.string().max(100),
        preferredWindow: z.record(z.string(), z.string()),
        active: z.boolean(),
      }),
    )
    .max(100),
});

export type PersonalProfilePayload = z.infer<typeof personalProfileSchema>;
