import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Flashcard } from "@/components/ui/Flashcard";
import { GradeButtons } from "@/components/ui/GradeButtons";
import { StatTile } from "@/components/ui/StatTile";

const SWATCHES = [
  { name: "paper", var: "--paper", on: "ink" },
  { name: "ink", var: "--ink", on: "paper" },
  { name: "pen", var: "--pen", on: "white" },
  { name: "correction", var: "--correction", on: "white" },
  { name: "check", var: "--check", on: "white" },
  { name: "highlight", var: "--highlight", on: "ink" },
] as const;

function Section({
  eyebrow,
  title,
  dek,
  children,
}: {
  eyebrow: string;
  title: string;
  dek?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5 border-t border-border py-10 first:border-t-0 first:pt-0">
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-correction">
          {eyebrow}
        </span>
        <h2 className="font-display text-xl font-bold tracking-tight">{title}</h2>
        {dek ? <p className="max-w-[60ch] font-body text-[15px] text-ink-soft">{dek}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default function StyleGuidePage() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col px-6 py-16">
      <header className="flex flex-col gap-3 pb-10">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          LinguaLoop / Design System
        </span>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">
          Notebook, not dashboard.
        </h1>
        <p className="max-w-[62ch] font-body text-base text-ink-soft">
          Every screen reads like a page from a student&rsquo;s vocabulary notebook: ruled paper,
          ballpoint ink, and a teacher&rsquo;s correction pen for what needs attention. Tokens and
          components below are the source of truth &mdash; build screens by composing these, not
          by hand-rolling new colors.
        </p>
        <div className="flex gap-2 pt-1">
          <Link href="/student">
            <Button variant="secondary" size="sm">
              View student app →
            </Button>
          </Link>
          <Link href="/admin">
            <Button variant="secondary" size="sm">
              View admin app →
            </Button>
          </Link>
        </div>
      </header>

      <Section
        eyebrow="01 · Color"
        title="Palette"
        dek="Ink blue is the student's pen. Correction red is the teacher's — reserved for what's due or wrong. Check green confirms; highlight marks a streak."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {SWATCHES.map((s) => (
            <div
              key={s.name}
              className="flex h-20 flex-col justify-between rounded-lg border border-border p-3"
              style={{ background: `var(${s.var})` }}
            >
              <span
                className="font-mono text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: s.on === "paper" ? "var(--paper)" : s.on === "ink" ? "var(--ink)" : "#fff" }}
              >
                {s.name}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="02 · Type"
        title="Three roles, three jobs"
        dek="Be Vietnam Pro carries headings and UI chrome — it was built for Latin + Vietnamese diacritics together. Source Serif reads the actual vocabulary content. JetBrains Mono aligns anything measured: IPA, stats, tags."
      >
        <div className="flex flex-col gap-5">
          <div>
            <p className="font-display text-2xl font-bold tracking-tight text-ink">
              Aa Ăă Ơơ — display / Be Vietnam Pro
            </p>
            <p className="font-mono text-xs text-ink-faint">headings, buttons, labels</p>
          </div>
          <div>
            <p className="font-body text-xl italic text-ink">
              “The entrance exam rewards precision.” — body / Source Serif 4
            </p>
            <p className="font-mono text-xs text-ink-faint">definitions, example sentences</p>
          </div>
          <div>
            <p className="font-mono text-xl text-ink">/æmˈbɪʃəs/ 12/15 — mono / JetBrains Mono</p>
            <p className="font-mono text-xs text-ink-faint">IPA, counters, tags, code</p>
          </div>
        </div>
      </Section>

      <Section eyebrow="03 · Components" title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Save card</Button>
          <Button variant="secondary">Edit</Button>
          <Button variant="ghost">Skip</Button>
          <Button variant="primary" size="sm">
            Assign deck
          </Button>
        </div>
      </Section>

      <Section eyebrow="03 · Components" title="Badges">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="pen">grade-10-entrance</Badge>
          <Badge tone="neutral">phrasal-verbs</Badge>
          <Badge tone="check">mastered</Badge>
          <Badge tone="correction">3 due</Badge>
        </div>
      </Section>

      <Section
        eyebrow="03 · Components"
        title="Stat tiles"
        dek="For the admin dashboard — the 'who's slipping' view leans on the correction tone."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Streak" value="14" hint="days" tone="check" />
          <StatTile label="Due today" value="8" hint="cards" />
          <StatTile label="Accuracy" value="92%" hint="7-day" tone="check" />
          <StatTile label="Last active" value="6d ago" tone="correction" />
        </div>
      </Section>

      <Section
        eyebrow="04 · Signature"
        title="The flashcard"
        dek="A lined index card, not a generic 'card' shape — the punched hole and folded corner are load-bearing: this is the one component every screen in the app is built around."
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <Flashcard
            tag={<Badge tone="pen">grade-10-entrance</Badge>}
            term="ambitious"
            ipa="æmˈbɪʃəs"
            meaning="having a strong desire to succeed or achieve something"
            example="She's ambitious about passing the entrance exam this year."
          />
          <Flashcard
            tag={<Badge tone="correction">due now</Badge>}
            term="resilient"
            ipa="rɪˈzɪliənt"
            meaning="able to recover quickly from difficulties"
            footer={<GradeButtons />}
          />
        </div>
      </Section>
    </main>
  );
}
