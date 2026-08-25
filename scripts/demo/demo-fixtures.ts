import { DEMO_STORY } from "../../lib/demo/story";

/**
 * Deterministic generation of the demo's physical and human structure.
 *
 * WHY EVERYTHING HERE IS SEEDED, NOT RANDOM
 * The seed must be re-runnable and must produce the same environment every
 * time (spec §23). `Math.random()` would make the second run disagree with the
 * first, so re-seeding after a restore would silently produce a different
 * portfolio -- different areas, different tenants, different arrears -- and the
 * marketing copy, the fixtures and the ledger would drift apart. A small
 * seeded PRNG makes "demo-seed-v1" mean one specific dataset.
 *
 * WHY NAMES ARE DRAWN FROM LISTS RATHER THAN GENERATED
 * "Test User 1" is the failure spec §21 names explicitly. Real-looking Arabic
 * and English names cost one array each and are the difference between a
 * screen that reads as a company and one that reads as a fixture.
 */

/** Seed identifier. Bump when the fixtures change in a way that must be re-seeded. */
export const DEMO_SEED_VERSION = "demo-seed-v1";

/**
 * mulberry32. Small, fast, and — the only property that matters here — the
 * same sequence for the same seed on every machine and every Node version.
 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic integer in [min, max]. */
function intBetween(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

const GIVEN_NAMES = [
  { ar: "أحمد", en: "Ahmed" },
  { ar: "محمد", en: "Mohamed" },
  { ar: "مصطفى", en: "Mostafa" },
  { ar: "كريم", en: "Karim" },
  { ar: "عمرو", en: "Amr" },
  { ar: "هشام", en: "Hisham" },
  { ar: "طارق", en: "Tarek" },
  { ar: "شريف", en: "Sherif" },
  { ar: "ياسر", en: "Yasser" },
  { ar: "خالد", en: "Khaled" },
  { ar: "منى", en: "Mona" },
  { ar: "دينا", en: "Dina" },
  { ar: "سلمى", en: "Salma" },
  { ar: "نهى", en: "Noha" },
  { ar: "ريم", en: "Reem" },
  { ar: "هالة", en: "Hala" },
  { ar: "ندى", en: "Nada" },
  { ar: "إيمان", en: "Iman" },
] as const;

const FAMILY_NAMES = [
  { ar: "الشناوي", en: "El-Shennawy" },
  { ar: "عبد الرحمن", en: "Abdelrahman" },
  { ar: "الجندي", en: "El-Gindy" },
  { ar: "منصور", en: "Mansour" },
  { ar: "الصاوي", en: "El-Sawy" },
  { ar: "حجازي", en: "Hegazy" },
  { ar: "زكي", en: "Zaki" },
  { ar: "الفقي", en: "El-Feky" },
  { ar: "سليمان", en: "Soliman" },
  { ar: "بدوي", en: "Badawy" },
  { ar: "القاضي", en: "El-Kady" },
  { ar: "شاهين", en: "Shahin" },
] as const;

export type GeneratedUnit = {
  /** Stable across runs — the idempotency key for this unit. */
  code: string;
  buildingCode: string;
  propertyCode: string;
  unitType: "APARTMENT" | "VILLA" | "CHALET" | "OFFICE" | "SHOP";
  floorNumber: number;
  area: number;
  /** The last `archived` units of each building, per the story. */
  archived: boolean;
  /** Drives whether this unit gets an owner, a lease, or neither. */
  tenure: "OWNER_RESIDENT" | "LEASED" | "VACANT";
};

export type GeneratedMember = {
  /**
   * The stable natural key. `members` has no `code` column and stores a single
   * name, so the identifier has to be a column that exists and is unique --
   * which leaves the email. The .invalid domain is reserved by RFC 2606 and can
   * never be registered, so no demo message can reach a real inbox.
   */
  email: string;
  /**
   * `members.full_name` is a single field, not a bilingual pair. Egyptian
   * owners and tenants carry Arabic names in both locales of a real system, so
   * storing one Arabic name is the accurate modelling rather than a shortcut.
   */
  fullName: string;
  phone: string;
};

/**
 * Builds every unit named by DEMO_STORY.buildings.
 *
 * Unit codes are structural (NH-A-0304 = block A, floor 3, unit 04) rather
 * than sequential, because that is how a real operator numbers stock and
 * because it makes the hierarchy legible in a table without a join.
 */
export function generateUnits(): GeneratedUnit[] {
  const units: GeneratedUnit[] = [];

  for (const building of DEMO_STORY.buildings) {
    const rng = makeRng(hashString(building.code));
    const perFloor = Math.ceil(building.count / building.floors);
    const [minArea, maxArea] = building.areaRange;

    for (let i = 0; i < building.count; i++) {
      const floor = Math.floor(i / perFloor) + 1;
      const indexOnFloor = (i % perFloor) + 1;

      // Palm Gate is a commercial tower: street level is retail, everything
      // above it is office space. A single unit_type for the whole building
      // would misrepresent how the ledger dimensions commercial property.
      const unitType: GeneratedUnit["unitType"] =
        building.code === "PG-T"
          ? floor === 1
            ? "SHOP"
            : "OFFICE"
          : (building.unitType as GeneratedUnit["unitType"]);

      units.push({
        code: `${building.code}-${String(floor).padStart(2, "0")}${String(indexOnFloor).padStart(2, "0")}`,
        buildingCode: building.code,
        propertyCode: building.propertyCode,
        unitType,
        floorNumber: floor,
        area: Number((minArea + rng() * (maxArea - minArea)).toFixed(2)),
        // Archived stock is taken from the END of the block, so adding units
        // later does not change which existing ones are archived.
        archived: i >= building.count - building.archived,
        tenure: "VACANT",
      });
    }
  }

  assignTenure(units);
  return units;
}

/**
 * Decides which units are occupied and how.
 *
 * Occupancy is applied to ACTIVE units only, and the split between owner-
 * resident and leased is deliberate: a portfolio that is entirely leased shows
 * only the rent engine, and one that is entirely owner-occupied shows only
 * service charges. The demo needs both subledgers populated.
 */
function assignTenure(units: GeneratedUnit[]): void {
  const active = units.filter((u) => !u.archived);
  const targetOccupied = Math.round(active.length * DEMO_STORY.targets.occupancy);

  // Deterministic ordering, then a fixed stride, so occupancy is spread across
  // every building instead of filling the first one and leaving the last empty.
  const rng = makeRng(hashString("tenure"));
  for (let i = 0; i < active.length; i++) {
    const unit = active[i]!;
    if (i >= targetOccupied) {
      unit.tenure = "VACANT";
      continue;
    }
    // Commercial stock is leased, never owner-resident: an office does not
    // have a resident owner, and showing one would be a modelling error a
    // property accountant would notice immediately.
    if (unit.unitType === "OFFICE" || unit.unitType === "SHOP") {
      unit.tenure = "LEASED";
    } else {
      unit.tenure = rng() < 0.55 ? "OWNER_RESIDENT" : "LEASED";
    }
  }
}

/**
 * One member per occupied unit, plus a handful of multi-unit owners, because a
 * portfolio where every owner holds exactly one unit does not exercise the
 * member-level statement at all.
 */
export function generateMembers(units: GeneratedUnit[]): {
  members: GeneratedMember[];
  /** unit code -> member email (the fixture's stable member key). */
  assignment: Map<string, string>;
} {
  const rng = makeRng(hashString("members"));
  const members: GeneratedMember[] = [];
  const assignment = new Map<string, string>();

  const occupied = units.filter((u) => !u.archived && u.tenure !== "VACANT");

  // Every fifth occupied unit reuses the previous member, producing owners and
  // tenants who hold more than one unit.
  let previous: GeneratedMember | null = null;

  for (let i = 0; i < occupied.length; i++) {
    const unit = occupied[i]!;

    if (previous && i % 5 === 0) {
      assignment.set(unit.code, previous.email);
      continue;
    }

    const given = pick(rng, GIVEN_NAMES);
    const family = pick(rng, FAMILY_NAMES);
    const ordinal = String(members.length + 1).padStart(4, "0");

    const member: GeneratedMember = {
      email: `m-${ordinal}@demo.aqarbooks.invalid`,
      fullName: `${given.ar} ${family.ar}`,
      // Shaped like a valid Egyptian mobile number and dialable by no one.
      phone: `+2010${String(intBetween(rng, 10000000, 19999999))}`,
    };

    members.push(member);
    assignment.set(unit.code, member.email);
    previous = member;
  }

  return { members, assignment };
}

/** FNV-1a. Turns a stable string into a stable seed. */
export function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The lease terms for every leased unit.
 *
 * WHY THIS IS A FIXTURE AND NOT DECIDED IN THE SEED
 * A lease is the answer to "who lives here and on what terms". If the seed
 * invented that at write time it would differ between runs, and re-seeding
 * would silently re-house every tenant. Deriving it here, from the same seeded
 * PRNG as everything else, makes the tenancy part of `demo-seed-v1`.
 *
 * WHY EVERY TERM SPANS THE OPERATING MONTH
 * `starts_on` is staggered so the portfolio does not look like it was signed on
 * one day, but every lease is constructed to be live across August 2026 --
 * otherwise a unit the fixtures call occupied would have no lease covering the
 * month the demo is showing, which is the exact contradiction this stage exists
 * to remove.
 */
export type GeneratedLease = {
  /** Unit code. One active lease per unit -- the database enforces this too. */
  unitCode: string;
  /** Member email: the fixture's stable member key. */
  memberEmail: string;
  rentAmount: number;
  rentFrequency: "MONTHLY" | "QUARTERLY" | "YEARLY";
  startsOn: string;
  endsOn: string;
  securityDepositAmount: number;
  /**
   * The tenant is billed directly. OWNER would mean the landlord receives the
   * invoice and recharges -- a real arrangement, but not one to model here,
   * because it would make the receivable belong to a member who is not the
   * occupant and muddle the very relationship this stage is fixing.
   */
  billingRecipient: "TENANT";
};

/** Monthly rent per square metre, by unit type, in EGP. */
const RENT_PER_SQM: Record<GeneratedUnit["unitType"], number> = {
  APARTMENT: 110,
  VILLA: 95,
  CHALET: 130,
  OFFICE: 190,
  SHOP: 320,
};

export function generateLeases(
  units: GeneratedUnit[],
  assignment: Map<string, string>,
): GeneratedLease[] {
  const rng = makeRng(hashString("leases"));
  const leases: GeneratedLease[] = [];

  for (const unit of units) {
    // Archived and vacant stock must never carry a lease. Asserted in the
    // tests as well, because this is the invariant that makes "occupied" mean
    // something on screen.
    if (unit.archived || unit.tenure !== "LEASED") continue;

    const memberEmail = assignment.get(unit.code);
    if (!memberEmail) continue;

    const monthly = Math.round((unit.area * RENT_PER_SQM[unit.unitType]) / 50) * 50;

    // Staggered start, one to twenty-four months before the operating month,
    // with a term long enough that the lease is still live in August 2026.
    const monthsBefore = 1 + Math.floor(rng() * 24);
    const termMonths = monthsBefore < 12 ? 12 : monthsBefore + 6;

    const start = addMonths(DEMO_STORY.period.start, -monthsBefore);
    // The term ends the day before the anniversary, so consecutive terms abut
    // rather than overlap -- the database's exclusion constraint on active
    // leases would reject an overlap outright.
    const end = addDays(addMonths(start, termMonths), -1);

    leases.push({
      unitCode: unit.code,
      memberEmail,
      rentAmount: monthly,
      // Commercial tenants are billed quarterly, residential monthly. A single
      // frequency across the portfolio would not exercise the rent schedule.
      rentFrequency: unit.unitType === "OFFICE" || unit.unitType === "SHOP" ? "QUARTERLY" : "MONTHLY",
      startsOn: start,
      endsOn: end,
      // Two months' rent, the common Egyptian arrangement. Held as a liability,
      // never revenue -- see the deposits work in the ledger.
      securityDepositAmount: monthly * 2,
      billingRecipient: "TENANT",
    });
  }

  return leases;
}

/** Calendar arithmetic on YYYY-MM-DD, clamped to the end of short months. */
function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const at = new Date(Date.UTC(y, m - 1, d + days));
  return at.toISOString().slice(0, 10);
}
