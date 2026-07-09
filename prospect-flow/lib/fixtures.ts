import type { Champion, Company, TimelineEvent } from "@/lib/types";

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

/*
  Real enterprise-AI / data-platform companies used as grounded "web search"
  results, so the fake search reads as credible. Dataiku is the top match: an
  enterprise-AI platform scaling its sales org fast (hiring AEs across EMEA &
  US) — a natural fit for a conversation-intelligence tool selling to sales orgs.
*/
const COMPANY_DOMAINS: Record<string, string> = {
  Dataiku: "dataiku.com",
  "Mistral AI": "mistral.ai",
  "Hugging Face": "huggingface.co",
  Databricks: "databricks.com",
  DataRobot: "datarobot.com",
};

const COMPANIES: Company[] = [
  {
    name: "Dataiku",
    location: "New York · Paris-founded",
    blurb: "Enterprise AI platform, ~1,600 staff — hiring AEs across EMEA & US",
    top: true,
  },
  { name: "Mistral AI", location: "Paris", blurb: "Frontier LLM lab, scaling its enterprise sales team" },
  { name: "Hugging Face", location: "Paris · New York", blurb: "AI/ML model hub, growing GTM org" },
  { name: "Databricks", location: "Amsterdam · EMEA HQ", blurb: "Data + AI lakehouse platform, large EMEA sales org" },
  { name: "DataRobot", location: "London · EMEA", blurb: "Enterprise AutoML platform" },
];

export function topCompany(): Company {
  return COMPANIES.find((c) => c.top) ?? COMPANIES[0];
}

function domainFor(company: string) {
  return COMPANY_DOMAINS[company] ?? `${company.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`;
}

/*
  The four real Dataiku sales leaders surfaced by the enrichment (FullEnrich),
  with their real work email / phone / LinkedIn. Nicolas is the primary champion:
  as RVP Sales for Southern Europe he owns the region that just added AEs.
*/
type Persona = {
  name: string;
  title: string;
  email: string;
  phone: string;
  linkedin: string;
};

const PRIMARY_PERSONA: Persona = {
  name: "Nicolas Bigourdan",
  title: "RVP Sales, Southern Europe",
  email: "nicolas.bigourdan@dataiku.com",
  phone: "+33 6 20 44 14 31",
  linkedin: "linkedin.com/in/nicolas-bigourdan",
};
const ALTERNATE_PERSONAS: Persona[] = [
  {
    name: "Aurélien Delort",
    title: "EMEA Sales Director, Enterprise Accounts",
    email: "aurelien.delort@dataiku.com",
    phone: "+33 6 76 10 88 54",
    linkedin: "linkedin.com/in/aurélien-delort-02545595",
  },
  {
    name: "Vincent Ezzahri",
    title: "Sales Director, Financial Services France",
    email: "vincent.ezzahri@dataiku.com",
    phone: "+33 6 48 53 16 24",
    linkedin: "linkedin.com/in/vincent-ezzahri",
  },
  {
    name: "Frédéric Lemeille",
    title: "RVP Sales, Manufacturing & Defense",
    email: "frederic.lemeille@dataiku.com",
    phone: "+33 6 74 35 24 83",
    linkedin: "linkedin.com/in/fredlemeille",
  },
];

function championFrom(persona: Persona, company: string): Champion {
  return {
    name: persona.name,
    initials: initialsOf(persona.name),
    title: persona.title,
    company,
    email: persona.email,
    phone: persona.phone,
    linkedin: persona.linkedin,
  };
}

export function primaryChampionFor(company: string): Champion {
  return championFrom(PRIMARY_PERSONA, company);
}

export function nextAlternateChampion(current: Champion): Champion {
  const pool = [PRIMARY_PERSONA, ...ALTERNATE_PERSONAS];
  const index = pool.findIndex((p) => p.name === current.name);
  const next = pool[(index + 1) % pool.length];
  return championFrom(next, current.company);
}

// --- events -----------------------------------------------------------------

function reasoning(id: string, text: string): TimelineEvent {
  return { id, type: "reasoning", text };
}

export function webSearchEvent(query: string): TimelineEvent {
  return {
    id: "web-search",
    type: "tool-call",
    tool: "web-search",
    data: { query, companies: COMPANIES },
  };
}

function sillageEvent(champion: Champion): TimelineEvent {
  return {
    id: `sillage-${champion.company}`,
    type: "tool-call",
    tool: "sillage",
    data: {
      domain: domainFor(champion.company),
      lookingFor: "Sales leaders — RVP / Sales Director",
      signals: [
        "3 new Account Executives hired this quarter",
        "12+ open sales roles across EMEA & US (AE, BDR, Sales Engineer)",
        "Scaling the Southern Europe sales team",
        "Hosting “Dataiku Succeed”, its enterprise-AI conference (NYC, Sep 24)",
      ],
      candidates: [
        { name: PRIMARY_PERSONA.name, title: PRIMARY_PERSONA.title, highlighted: true },
        ...ALTERNATE_PERSONAS.map((p) => ({ name: p.name, title: p.title })),
      ],
    },
  };
}

export function fullEnrichEvent(champion: Champion): TimelineEvent {
  return {
    id: `fullenrich-${champion.name}`,
    type: "tool-call",
    tool: "fullenrich",
    data: {
      targetName: champion.name,
      targetTitle: champion.title,
      targetCompany: champion.company,
      fields: [
        { label: "Email", value: champion.email },
        { label: "Phone", value: champion.phone },
        {
          label: "LinkedIn",
          value:
            champion.linkedin ??
            `linkedin.com/in/${champion.name.toLowerCase().replace(/\s+/g, "")}`,
        },
      ],
    },
  };
}

export function championConfirmEvent(champion: Champion): TimelineEvent {
  return { id: `champion-confirm-${champion.name}`, type: "champion-confirm", champion };
}

// --- step lists (consumed by the manual sequencer) --------------------------

export type Step =
  | { t: "event"; event: TimelineEvent }
  | { t: "tool"; event: TimelineEvent }
  | { t: "pause"; stage: "awaiting-company" | "awaiting-champion" }
  | { t: "end" };

/** After the user submits a target: interpret it, then web-search for companies. */
export function startSteps(query: string): Step[] {
  return [
    {
      t: "event",
      event: reasoning(
        "reason-interpret",
        `Starting from “${query}”. I'll find companies that match this ICP, then zero in on the strongest account to pursue.`,
      ),
    },
    { t: "tool", event: webSearchEvent(query) },
    { t: "pause", stage: "awaiting-company" },
  ];
}

/** After a company is chosen: reason, run Sillage, reason again, enrich. */
export function afterCompanySteps(company: Company): Step[] {
  const champion = primaryChampionFor(company.name);
  return [
    {
      t: "event",
      event: reasoning(
        "reason-company",
        `${company.name} is the strongest fit — ${company.blurb}. Pulling their team and hiring signals from Sillage.`,
      ),
    },
    { t: "tool", event: sillageEvent(champion) },
    {
      t: "event",
      event: reasoning(
        "reason-persona",
        `${champion.name} runs Sales for Southern Europe — the region that just added three AEs. As the leader carrying that number, he's the cleanest entry point for a conversation-intelligence tool like Modjo. Enriching his direct line.`,
      ),
    },
    { t: "tool", event: fullEnrichEvent(champion) },
    { t: "event", event: championConfirmEvent(champion) },
    { t: "pause", stage: "awaiting-champion" },
  ];
}

/** After picking a different persona: brief reason, re-enrich, re-confirm. */
export function pickDifferentSteps(champion: Champion): Step[] {
  return [
    {
      t: "event",
      event: reasoning(
        `reason-switch-${champion.name}`,
        `Switching to ${champion.name} — ${champion.title} may be a cleaner entry point. Re-enriching.`,
      ),
    },
    { t: "tool", event: fullEnrichEvent(champion) },
    { t: "event", event: championConfirmEvent(champion) },
    { t: "pause", stage: "awaiting-champion" },
  ];
}
