// Server-action tests with controlled (mocked) dependencies -- the tier
// pure-function fixtures can't cover: that requireAdmin() is actually
// called, and called before any database access; that the conditional
// UPDATE's payload and filters are exactly what's claimed; that a zero-
// rows-affected result is classified rather than reported as success; and
// that a database error never becomes a success outcome.
//
// What this tier still does NOT prove: real RLS enforcement (a mocked
// requireAdmin/createClient can't fail the way live Postgres policies
// would), or true concurrent-request atomicity (the "sequential duplicate
// submit" test below calls the action twice in a row against a shared
// in-memory fake store, which proves the *logic* doesn't re-approve a
// row it already approved, but two JS calls in sequence are not two
// simultaneous database transactions). The real conditional-update race
// was checked separately against a disposable, non-production Postgres
// container (see the feature's handoff notes) rather than folded into
// this suite, since that needs Docker and this suite shouldn't.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin", () => ({
  requireAdmin: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { requireAdmin } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import { approveForOutreach } from "./pendingReview";

const VALID_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_ID = "22222222-2222-2222-2222-222222222222";

type FakeRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  archived: boolean;
  pending_hard_delete: boolean;
  pending_state_review: boolean;
};

// A minimal fake that actually applies .eq() filters against an in-memory
// Map, so the conditional UPDATE's real filter-matching behavior (not just
// "was update() called") is exercised -- closer to the real thing than a
// hand-stubbed single return value, without needing a database.
function makeFakeSupabase(store: Map<string, FakeRow>) {
  return {
    from(table: string) {
      expect(table).toBe("events");
      return {
        update(payload: Partial<FakeRow>) {
          const conditions: Record<string, unknown> = {};
          const chain = {
            eq(col: string, val: unknown) {
              conditions[col] = val;
              return chain;
            },
            select() {
              const row = store.get(conditions.id as string);
              const matches =
                !!row && Object.entries(conditions).every(([k, v]) => (row as Record<string, unknown>)[k] === v);
              if (matches && row) {
                Object.assign(row, payload);
                return Promise.resolve({ data: [{ ...row }], error: null });
              }
              return Promise.resolve({ data: [], error: null });
            },
          };
          return chain;
        },
        select() {
          const conditions: Record<string, unknown> = {};
          const chain = {
            eq(col: string, val: unknown) {
              conditions[col] = val;
              return chain;
            },
            maybeSingle() {
              const row = store.get(conditions.id as string) ?? null;
              return Promise.resolve({ data: row ? { ...row } : null, error: null });
            },
          };
          return chain;
        },
      };
    },
    __conditionsSeen: undefined as unknown,
  };
}

function baseRow(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    id: VALID_ID,
    name: "Test Event",
    city: "Tempe",
    state: "AZ",
    archived: false,
    pending_hard_delete: false,
    pending_state_review: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(requireAdmin).mockReset();
  vi.mocked(createClient).mockReset();
});

describe("approveForOutreach -- admin gate", () => {
  it("calls requireAdmin() before touching the database, and never reaches it if requireAdmin rejects", async () => {
    // requireAdmin() redirect()s a non-admin in the real app, which Next
    // surfaces as a thrown error outside normal control flow -- modeled
    // here as a rejected promise.
    vi.mocked(requireAdmin).mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(approveForOutreach(VALID_ID)).rejects.toThrow("NEXT_REDIRECT");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("checks the id format before calling createClient at all", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ id: "admin-1", email: "greg@example.com" });

    const result = await approveForOutreach("not-a-uuid");

    expect(result).toEqual({ outcome: "invalid_id" });
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("approveForOutreach -- a real approval", () => {
  it("flips pending_state_review true -> false, touches no other column, and returns the snapshot", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ id: "admin-1", email: "greg@example.com" });
    const store = new Map<string, FakeRow>([[VALID_ID, baseRow()]]);
    vi.mocked(createClient).mockResolvedValue(makeFakeSupabase(store) as never);

    const result = await approveForOutreach(VALID_ID);

    expect(result.outcome).toBe("approved");
    if (result.outcome === "approved") {
      expect(result.event.pending_state_review).toBe(false);
      expect(result.event.name).toBe("Test Event");
      expect(result.event.city).toBe("Tempe");
      expect(result.event.state).toBe("AZ");
      expect(result.event.archived).toBe(false);
      expect(result.event.pending_hard_delete).toBe(false);
    }
    // The store itself reflects only the one intended field changed --
    // proof the update payload didn't carry anything else, not an
    // assumption from "no trigger exists on this table."
    expect(store.get(VALID_ID)).toMatchObject({
      name: "Test Event",
      city: "Tempe",
      state: "AZ",
      archived: false,
      pending_hard_delete: false,
      pending_state_review: false,
    });
  });

  it("never approves a different event than the one requested", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ id: "admin-1", email: "greg@example.com" });
    const store = new Map<string, FakeRow>([
      [VALID_ID, baseRow({ id: VALID_ID })],
      [OTHER_ID, baseRow({ id: OTHER_ID, name: "Other Event" })],
    ]);
    vi.mocked(createClient).mockResolvedValue(makeFakeSupabase(store) as never);

    await approveForOutreach(VALID_ID);

    expect(store.get(OTHER_ID)?.pending_state_review).toBe(true);
  });
});

describe("approveForOutreach -- stale/non-approvable records, classified honestly", () => {
  it("reports already_approved, with no second approval, when pending_state_review is already false", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ id: "admin-1", email: "greg@example.com" });
    const store = new Map<string, FakeRow>([[VALID_ID, baseRow({ pending_state_review: false })]]);
    vi.mocked(createClient).mockResolvedValue(makeFakeSupabase(store) as never);

    const result = await approveForOutreach(VALID_ID);

    expect(result.outcome).toBe("already_approved");
  });

  it("reports archived, not approved, for an archived event", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ id: "admin-1", email: "greg@example.com" });
    const store = new Map<string, FakeRow>([[VALID_ID, baseRow({ archived: true })]]);
    vi.mocked(createClient).mockResolvedValue(makeFakeSupabase(store) as never);

    const result = await approveForOutreach(VALID_ID);

    expect(result.outcome).toBe("archived");
  });

  it("reports pending_hard_delete, not approved, for an event pending hard delete", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ id: "admin-1", email: "greg@example.com" });
    const store = new Map<string, FakeRow>([[VALID_ID, baseRow({ pending_hard_delete: true })]]);
    vi.mocked(createClient).mockResolvedValue(makeFakeSupabase(store) as never);

    const result = await approveForOutreach(VALID_ID);

    expect(result.outcome).toBe("pending_hard_delete");
  });

  it("reports not_found for an id that matches no row", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ id: "admin-1", email: "greg@example.com" });
    const store = new Map<string, FakeRow>();
    vi.mocked(createClient).mockResolvedValue(makeFakeSupabase(store) as never);

    const result = await approveForOutreach(VALID_ID);

    expect(result).toEqual({ outcome: "not_found" });
  });

  it("sequential duplicate submit: the second call on an already-approved event does not re-approve it", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ id: "admin-1", email: "greg@example.com" });
    const store = new Map<string, FakeRow>([[VALID_ID, baseRow()]]);
    vi.mocked(createClient).mockResolvedValue(makeFakeSupabase(store) as never);

    const first = await approveForOutreach(VALID_ID);
    const second = await approveForOutreach(VALID_ID);

    expect(first.outcome).toBe("approved");
    expect(second.outcome).toBe("already_approved");
  });
});

describe("approveForOutreach -- database errors never become success", () => {
  it("reports the update error instead of success", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ id: "admin-1", email: "greg@example.com" });
    vi.mocked(createClient).mockResolvedValue({
      from: () => ({
        update: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  select: () =>
                    Promise.resolve({ data: null, error: { message: "connection reset" } }),
                }),
              }),
            }),
          }),
        }),
      }),
    } as never);

    const result = await approveForOutreach(VALID_ID);

    expect(result).toEqual({ outcome: "error", error: "connection reset" });
  });

  it("reports an error rather than a clean approval if the update somehow matches more than one row", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ id: "admin-1", email: "greg@example.com" });
    vi.mocked(createClient).mockResolvedValue({
      from: () => ({
        update: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  select: () =>
                    Promise.resolve({
                      data: [baseRow(), baseRow({ id: OTHER_ID })],
                      error: null,
                    }),
                }),
              }),
            }),
          }),
        }),
      }),
    } as never);

    const result = await approveForOutreach(VALID_ID);

    expect(result.outcome).toBe("error");
  });

  it("reports the re-read error instead of success when the update affects zero rows and the classifying re-read also fails", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ id: "admin-1", email: "greg@example.com" });
    vi.mocked(createClient).mockResolvedValue({
      from: () => ({
        update: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  select: () => Promise.resolve({ data: [], error: null }),
                }),
              }),
            }),
          }),
        }),
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({ data: null, error: { message: "read timed out" } }),
          }),
        }),
      }),
    } as never);

    const result = await approveForOutreach(VALID_ID);

    expect(result).toEqual({ outcome: "error", error: "read timed out" });
  });
});
