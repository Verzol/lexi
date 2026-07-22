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
    <section className="flex flex-col gap-6 border-t border-border py-12 first:border-t-0 first:pt-0">
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-pen">
          {eyebrow}
        </span>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">{title}</h2>
        {dek ? (
          <p className="max-w-[62ch] font-body text-[15px] leading-normal text-ink-soft">{dek}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export default function StyleGuidePage() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col px-6 py-16 sm:py-24">
      {/* Hero — the product shown as its own artifact: a dictionary entry. */}
      <header className="flex flex-col gap-8 pb-14">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
          Lexi · Design System
        </span>

        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h1 className="font-display text-5xl font-semibold tracking-tight text-ink sm:text-[64px]">
              lexi&middot;con
            </h1>
            <span className="font-mono text-lg text-ink-faint">/ˈleksɪkən/</span>
            <span className="font-display text-lg italic text-ink-soft">n.</span>
          </div>
          <div className="h-px w-full max-w-2xl bg-border" aria-hidden />
          <p className="max-w-[54ch] font-display text-xl leading-snug text-ink">
            The whole store of words a person knows &mdash; and, here, the one each student builds
            from memory, one card a day.
          </p>
          <p className="max-w-[60ch] font-body text-[15px] leading-normal text-ink-soft">
            Every screen reads like an entry in that dictionary: a literary headword, a pronunciation
            key set in mono, a definition in serif. Compose the tokens and components below &mdash;
            never hand-roll a new color.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5 pt-1">
          <Link href="/student">
            <Button variant="secondary" size="sm">
              Student app →
            </Button>
          </Link>
          <Link href="/admin">
            <Button variant="secondary" size="sm">
              Admin app →
            </Button>
          </Link>
        </div>
      </header>

      <Section
        eyebrow="Color"
        title="Archival paper, indigo ink"
        dek="Indigo ink is the student's pen — links, actions, focus. Correction red is the teacher's, reserved for what's due or wrong. Check green confirms a recall; gold marks a streak."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {SWATCHES.map((s) => (
            <div
              key={s.name}
              className="flex h-20 flex-col justify-end rounded-lg border border-border p-3"
              style={{ background: `var(${s.var})` }}
            >
              <span
                className="font-mono text-[11px] font-semibold uppercase tracking-wider"
                style={{
                  color:
                    s.on === "paper"
                      ? "var(--paper)"
                      : s.on === "ink"
                        ? "var(--ink)"
                        : "#fff",
                }}
              >
                {s.name}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Type"
        title="Three roles, three jobs"
        dek="Fraunces sets the headwords and headings — a literary serif with optical contrast. Be Vietnam Pro runs the interface and supports Latin and Vietnamese together. JetBrains Mono aligns anything measured: IPA, counters, tags."
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <p className="font-display text-3xl font-semibold tracking-tight text-ink">
              Aa Ăă Ơơ — headwords &amp; headings
            </p>
            <p className="font-mono text-xs text-ink-faint">Fraunces · display serif</p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="font-body text-lg text-ink">
              The entrance exam rewards precision — interface &amp; running text.
            </p>
            <p className="font-mono text-xs text-ink-faint">Be Vietnam Pro · UI sans</p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="font-mono text-lg text-ink">/æmˈbɪʃəs/ · 12 / 15 · phrasal-verbs</p>
            <p className="font-mono text-xs text-ink-faint">JetBrains Mono · pronunciation key</p>
          </div>
        </div>
      </Section>

      <Section eyebrow="Components" title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Save card</Button>
          <Button variant="secondary">Edit</Button>
          <Button variant="ghost">Skip</Button>
          <Button variant="primary" size="sm">
            Assign deck
          </Button>
        </div>
      </Section>

      <Section eyebrow="Components" title="Badges">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="pen">grade-10-entrance</Badge>
          <Badge tone="neutral">phrasal-verbs</Badge>
          <Badge tone="check">mastered</Badge>
          <Badge tone="correction">3 due</Badge>
        </div>
      </Section>

      <Section
        eyebrow="Components"
        title="Stat tiles"
        dek="The dashboard's numbers, set in the display serif so a class at a glance still feels composed, not like a spreadsheet."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Streak" value="14" hint="days" tone="check" />
          <StatTile label="Due today" value="8" hint="cards" />
          <StatTile label="Accuracy" value="92%" hint="7-day" tone="check" />
          <StatTile label="Last active" value="6d ago" tone="correction" />
        </div>
      </Section>

      <Section
        eyebrow="Signature"
        title="The entry"
        dek="A dictionary entry, not a generic card: the headword in serif with its pronunciation key, and one ink stroke down the binding edge — the pen that wrote it. Every study screen is built around this shape."
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <Flashcard
            tag={<Badge tone="pen">grade-10-entrance</Badge>}
            term="ambitious"
            ipa="æmˈbɪʃəs"
            meaning="Having a strong desire to succeed or achieve something."
            example="She's ambitious about passing the entrance exam this year."
          />
          <Flashcard
            tag={<Badge tone="correction">due now</Badge>}
            term="resilient"
            ipa="rɪˈzɪliənt"
            meaning="Able to recover quickly from difficulties."
            footer={<GradeButtons />}
          />
        </div>
      </Section>
    </main>
  );
}
