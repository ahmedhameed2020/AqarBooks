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
