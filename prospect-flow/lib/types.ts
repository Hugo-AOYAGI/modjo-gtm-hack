export type Champion = {
  name: string;
  initials: string;
  title: string;
  company: string;
  email: string;
  phone: string;
  linkedin?: string;
};

export type Company = {
  name: string;
  location: string;
  blurb: string;
  /** Whether this is the agent's recommended top match. */
  top?: boolean;
};

export type CompanySearchData = {
  query: string;
  companies: Company[];
};

export type SillageCandidate = {
  name: string;
  title: string;
  highlighted?: boolean;
};

export type SillageData = {
  domain: string;
  lookingFor: string;
  /** Recent company movements / buying signals surfaced by Sillage. */
  signals?: string[];
  candidates: SillageCandidate[];
};

export type FullEnrichField = {
  label: string;
  value: string;
};

export type FullEnrichData = {
  targetName: string;
  targetTitle: string;
  targetCompany: string;
  fields: FullEnrichField[];
};

export type DeckData = {
  title: string;
  slideCount: number;
  subtitle: string;
  url?: string;
};

export type EmailData = {
  recipientKind: "prospect" | "bdr";
  to: string;
  subject: string;
  preview: string;
};

/**
 * One entry in the agent timeline. Add a new variant + matching component in
 * `components/timeline` + a case in `TimelineEventView` to introduce a new
 * stage — nothing else in the flow needs to change.
 */
export type TimelineEvent =
  | { id: string; type: "user-prompt"; text: string }
  | { id: string; type: "reasoning"; text: string }
  | { id: string; type: "tool-call"; tool: "web-search"; data: CompanySearchData }
  | { id: string; type: "tool-call"; tool: "sillage"; data: SillageData }
  | { id: string; type: "tool-call"; tool: "fullenrich"; data: FullEnrichData }
  | { id: string; type: "champion-confirm"; champion: Champion }
  | { id: string; type: "live-call"; champion: Champion }
  | { id: string; type: "tool-call"; tool: "gamma"; data: DeckData }
  | { id: string; type: "email"; data: EmailData };

export type ToolEventId = Extract<TimelineEvent, { type: "tool-call" }>["id"];
