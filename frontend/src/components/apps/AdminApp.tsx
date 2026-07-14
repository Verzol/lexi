"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Flashcard } from "@/components/ui/Flashcard";
import { Icon, type IconName } from "@/components/ui/Icon";
import { SignOutButton } from "@/components/ui/SignOutButton";
import { StatTile } from "@/components/ui/StatTile";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useAuth } from "@/lib/auth/AuthProvider";

/**
 * AdminApp — the teacher's desktop surface (SoW §4 admin scope): a data-dense
 * dashboard ("who's slipping") and the make-or-break fast-add + AI-enrichment
 * flow. Scanned, not read. Ported from the Lexi Design System's admin UI kit.
 */

const STUDENTS = [
  { name: "Mai Nguyen", streak: 14, last: "today", due: 3, week: 42, acc: 92, slip: false },
  { name: "Duc Tran", streak: 9, last: "today", due: 0, week: 38, acc: 88, slip: false },
  { name: "Linh Pham", streak: 0, last: "6d ago", due: 21, week: 0, acc: 61, slip: true },
  { name: "Huy Le", streak: 3, last: "yesterday", due: 7, week: 19, acc: 79, slip: false },
  { name: "An Vo", streak: 0, last: "9d ago", due: 28, week: 0, acc: 55, slip: true },
  { name: "Thao Bui", streak: 21, last: "today", due: 2, week: 51, acc: 95, slip: false },
];

const SAMPLE: Record<string, { ipa: string; meaning: string; example: string }> = {
  ambitious: {
    ipa: "æmˈbɪʃəs",
    meaning: "having a strong desire to succeed or achieve something",
    example: "She's ambitious about passing the entrance exam this year.",
  },
  pragmatic: {
    ipa: "præɡˈmætɪk",
    meaning: "dealing with things sensibly and realistically",
    example: "Take a pragmatic approach: review a little every day.",
  },
};

type View = "dashboard" | "decks" | "students";

function Field({
  label,
  value,
  serif,
  mono,
  italic,
}: {
  label: string;
  value: string;
  serif?: boolean;
  mono?: boolean;
  italic?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-surface px-3.5 py-2.5">
      <span className="mb-1 block font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
        {label}
      </span>
      <span
        className={`${mono ? "font-mono text-sm" : serif ? "font-body text-[15px]" : "font-display text-[15px]"} ${
          italic ? "italic" : ""
        } text-ink`}
      >
        {value}
      </span>
    </div>
  );
}

const NAV_ITEMS: { k: View; label: string; icon: IconName }[] = [
  { k: "dashboard", label: "Dashboard", icon: "layers" },
  { k: "decks", label: "Add vocab", icon: "arrowRight" },
  { k: "students", label: "Students", icon: "settings" },
];

/** Mobile header: the sidebar collapses to this below `lg`. */
function MobileBar({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface lg:hidden">
      <div className="flex items-center gap-2 px-4 py-3">
        <span className="font-display text-xl font-extrabold tracking-tight text-pen">
          Lexi<span className="text-correction">.</span>
        </span>
        <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
          Teacher
        </span>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <SignOutButton label={false} />
        </div>
      </div>
      {/* Nav becomes a scrollable tab strip rather than a hidden drawer. */}
      <nav className="flex gap-1 overflow-x-auto border-t border-border px-2 py-1.5">
        {NAV_ITEMS.map((it) => {
          const on = view === it.k;
          return (
            <button
              key={it.k}
              onClick={() => onChange(it.k)}
              className={`flex flex-shrink-0 items-center gap-2 rounded-md px-3 py-2 font-display text-[13px] font-semibold ${
                on ? "bg-pen-soft text-pen" : "text-ink-soft"
              }`}
            >
              <Icon name={it.icon} size={16} />
              {it.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}

function Nav({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const { user } = useAuth();
  const initial = user?.display_name.trim().charAt(0).toUpperCase() ?? "?";

  return (
    <aside className="hidden w-[216px] flex-shrink-0 flex-col gap-1 border-r border-border bg-surface px-3.5 py-5 lg:flex">
      <div className="flex items-center gap-2 px-2 pb-4">
        <span className="font-display text-[22px] font-extrabold tracking-tight text-pen">
          Lexi<span className="text-correction">.</span>
        </span>
        <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
          Teacher
        </span>
        <ThemeToggle className="ml-auto" />
      </div>
      {NAV_ITEMS.map((it) => {
        const on = view === it.k;
        return (
          <button
            key={it.k}
            onClick={() => onChange(it.k)}
            className={`flex items-center gap-2.5 rounded-md border-0 px-3 py-2.5 font-display text-sm font-semibold transition-colors ${
              on ? "bg-pen-soft text-pen" : "bg-transparent text-ink-soft hover:text-ink"
            }`}
          >
            <Icon name={it.icon} size={18} />
            {it.label}
          </button>
        );
      })}
      <div className="mt-auto flex flex-col gap-2.5 border-t border-border pt-2.5">
        <div className="flex items-center gap-2.5 px-2">
          <div className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-full bg-ink font-display text-[13px] font-bold text-paper">
            {initial}
          </div>
          <div className="min-w-0">
            <div className="truncate font-display text-[13px] font-semibold text-ink">
              {user?.display_name ?? "—"}
            </div>
            <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
              Admin
            </div>
          </div>
        </div>
        <SignOutButton className="w-full" />
      </div>
    </aside>
  );
}

function Dashboard({ onAddVocab }: { onAddVocab: () => void }) {
  const slipping = STUDENTS.filter((s) => s.slip);
  return (
    <div className="w-full overflow-y-auto p-4 sm:p-7">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
            This week · 12 students
          </p>
          <h1 className="mt-1 font-display text-[28px] font-extrabold tracking-tight text-ink">Class overview</h1>
        </div>
        <Button variant="primary" size="sm" onClick={onAddVocab}>
          Add vocab
        </Button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Active this week" value="9/12" hint="weekly active" tone="check" />
        <StatTile label="Reviewed" value="1,204" hint="cards, 7-day" />
        <StatTile label="Avg accuracy" value="83%" hint="class, 7-day" />
        <StatTile label="Slipping" value="2" hint="no activity 5d+" tone="correction" />
      </div>

      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-correction">
          <Icon name="flame" size={16} />
        </span>
        <h2 className="m-0 font-display text-[15px] font-bold text-ink">Who&rsquo;s slipping</h2>
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
          {slipping.length} need a nudge
        </span>
      </div>

      <div className="overflow-hidden overflow-x-auto rounded-lg border border-border bg-surface shadow-card">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr className="border-b border-border">
              {["Student", "Streak", "Last active", "Due", "Reviewed (wk)", "Accuracy", ""].map((h, i) => (
                <th
                  key={i}
                  className={`px-4 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-faint ${
                    i === 0 ? "text-left" : "text-center"
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {STUDENTS.map((s) => (
              <tr key={s.name} className={`border-b border-grid-line ${s.slip ? "bg-correction-soft" : ""}`}>
                <td className="px-4 py-2.5 font-display text-sm font-semibold text-ink">{s.name}</td>
                <td
                  className={`px-4 py-2.5 text-center font-mono text-[13px] font-bold ${
                    s.streak ? "text-check" : "text-ink-faint"
                  }`}
                >
                  {s.streak || "—"}
                </td>
                <td
                  className={`px-4 py-2.5 text-center font-mono text-xs ${
                    s.slip ? "text-correction" : "text-ink-soft"
                  }`}
                >
                  {s.last}
                </td>
                <td
                  className={`px-4 py-2.5 text-center font-mono text-[13px] font-bold ${
                    s.due > 10 ? "text-correction" : "text-ink"
                  }`}
                >
                  {s.due}
                </td>
                <td className="px-4 py-2.5 text-center font-mono text-[13px] text-ink-soft">{s.week}</td>
                <td
                  className={`px-4 py-2.5 text-center font-mono text-[13px] font-bold ${
                    s.acc >= 80 ? "text-check" : "text-correction"
                  }`}
                >
                  {s.acc}%
                </td>
                <td className="px-4 py-2.5 text-center">
                  {s.slip ? <Badge tone="correction">nudge</Badge> : <Badge tone="check">on track</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AddVocab() {
  const [term, setTerm] = useState("");
  const [enriched, setEnriched] = useState<{ ipa: string; meaning: string; example: string } | null>(null);
  const [loading, setLoading] = useState(false);

  function enrich() {
    if (!term.trim()) return;
    setLoading(true);
    setEnriched(null);
    setTimeout(() => {
      const key = term.trim().toLowerCase();
      setEnriched(
        SAMPLE[key] ?? {
          ipa: "prəˈvɪʒn(ə)l",
          meaning: "arranged or existing for the present, possibly to be changed later",
          example: `The teacher reviews every ${term.trim()} before it is saved.`,
        }
      );
      setLoading(false);
    }, 900);
  }

  return (
    <div className="grid w-full gap-7 overflow-y-auto p-4 sm:p-7 lg:grid-cols-2">
      <div>
        <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
          Entrance Exam — Core 300
        </p>
        <h1 className="mt-1 mb-1.5 font-display text-[26px] font-extrabold tracking-tight text-ink">Fast add</h1>
        <p className="mb-[18px] max-w-[42ch] font-body text-[15px] text-ink-soft">
          Type a word, let AI draft the definition, IPA, and example. You review and edit before anything saves —
          nothing auto-publishes.
        </p>

        <div className="mb-4 flex gap-2">
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && enrich()}
            placeholder="e.g. ambitious"
            className="h-11 flex-1 rounded-md border border-border bg-surface px-3.5 font-display text-[15px] text-ink outline-none"
          />
          <Button variant="primary" onClick={enrich} disabled={loading}>
            {loading ? "Enriching…" : "Enrich"}
          </Button>
        </div>

        {enriched ? (
          <div className="flex flex-col gap-3">
            <Field label="Meaning" value={enriched.meaning} serif />
            <Field label="IPA" value={`/${enriched.ipa}/`} mono />
            <Field label="Example" value={enriched.example} serif italic />
            <div className="mt-1 flex gap-2">
              <Button
                variant="primary"
                onClick={() => {
                  setEnriched(null);
                  setTerm("");
                }}
              >
                Save card
              </Button>
              <Button variant="secondary" onClick={enrich}>
                Regenerate
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setEnriched(null);
                  setTerm("");
                }}
              >
                Discard
              </Button>
            </div>
          </div>
        ) : (
          <p className="font-body text-sm italic text-ink-faint">
            {loading ? "Asking the model…" : "Draft appears here for your review."}
          </p>
        )}
      </div>

      <div>
        <p className="mb-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
          Live preview
        </p>
        <Flashcard
          tag={<Badge tone="pen">grade-10-entrance</Badge>}
          term={term.trim() || "ambitious"}
          ipa={enriched ? enriched.ipa : "æmˈbɪʃəs"}
          meaning={enriched ? enriched.meaning : "having a strong desire to succeed or achieve something"}
          example={enriched ? enriched.example : "She's ambitious about passing the entrance exam this year."}
        />
        <div className="mt-[18px] rounded-md border border-border bg-surface p-4 shadow-sm">
          <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
            Assign to
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="pen">whole class</Badge>
            <Badge tone="neutral">Mai</Badge>
            <Badge tone="neutral">Duc</Badge>
            <Badge tone="neutral">+9</Badge>
          </div>
          <p className="mt-3 font-body text-[13px] text-ink-soft">
            Daily new-card target: <b className="font-mono">10</b>/student
          </p>
        </div>
      </div>
    </div>
  );
}

function Students() {
  return (
    <div className="flex w-full items-center justify-center p-7 font-body text-sm italic text-ink-faint">
      Roster management — teacher-created accounts (no self-signup). Placeholder view.
    </div>
  );
}

export function AdminApp() {
  const [view, setView] = useState<View>("dashboard");

  const screen =
    view === "dashboard" ? (
      <Dashboard onAddVocab={() => setView("decks")} />
    ) : view === "decks" ? (
      <AddVocab />
    ) : (
      <Students />
    );

  return (
    // Sidebar beside the content on desktop; stacked under a tab bar on mobile.
    <div className="flex flex-1 flex-col text-ink lg:flex-row">
      <MobileBar view={view} onChange={setView} />
      <Nav view={view} onChange={setView} />
      <main className="flex min-w-0 flex-1 flex-col">{screen}</main>
    </div>
  );
}
