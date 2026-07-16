"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Flashcard } from "@/components/ui/Flashcard";
import { Icon, type IconName } from "@/components/ui/Icon";
import { SignOutButton } from "@/components/ui/SignOutButton";
import { StatTile } from "@/components/ui/StatTile";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import {
  admin,
  ApiError,
  type DashboardStudent,
  type Deck,
  type UserOut,
} from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";

/**
 * AdminApp — the teacher's desktop surface (SoW §4 admin scope): a data-dense
 * dashboard ("who's slipping") and the make-or-break fast-add + AI-enrichment
 * flow. Scanned, not read. Ported from the Lexi Design System's admin UI kit.
 */

/** "today" / "yesterday" / "3d ago" / "never" from the dashboard's inactivity days. */
function lastActiveLabel(s: DashboardStudent): string {
  if (s.last_active_at == null || s.days_inactive == null) return "never";
  if (s.days_inactive <= 0) return "today";
  if (s.days_inactive === 1) return "yesterday";
  return `${s.days_inactive}d ago`;
}

type View = "dashboard" | "decks" | "students";

/** A labeled, editable field — the teacher reviews and edits every draft here
 * before it saves (nothing from the AI path auto-persists). */
function EditField({
  label,
  value,
  onChange,
  mono,
  multiline,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
  multiline?: boolean;
  placeholder?: string;
}) {
  const cls = `w-full rounded-md border border-border bg-surface px-3 py-2 text-ink outline-none focus:border-pen ${
    mono ? "font-mono text-sm" : "font-body text-[15px]"
  }`;
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
        {label}
      </span>
      {multiline ? (
        <textarea rows={2} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      )}
    </label>
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
  const dash = useQuery({ queryKey: ["admin-dashboard"], queryFn: admin.dashboard });
  const students = dash.data?.students ?? [];
  const summary = dash.data?.summary;
  const decks = dash.data?.decks ?? [];
  const slipping = students.filter((s) => s.slipping);

  return (
    <div className="w-full overflow-y-auto p-4 sm:p-7">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
            Last 7 days · {summary ? `${summary.total_students} students` : "class overview"}
          </p>
          <h1 className="mt-1 font-display text-[28px] font-extrabold tracking-tight text-ink">Class overview</h1>
        </div>
        <Button variant="primary" size="sm" onClick={onAddVocab}>
          Add vocab
        </Button>
      </div>

      {dash.isError ? (
        <p
          role="alert"
          className="mb-4 rounded-md border border-correction bg-correction-soft px-3.5 py-2.5 font-body text-sm text-correction"
        >
          Couldn&rsquo;t load the class dashboard — {(dash.error as Error).message}
        </p>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Active this week"
          value={summary ? `${summary.active_this_week}/${summary.total_students}` : "—"}
          hint="weekly active"
          tone="check"
        />
        <StatTile
          label="Reviewed"
          value={summary ? summary.reviewed_week.toLocaleString() : "—"}
          hint="cards, 7-day"
        />
        <StatTile
          label="Avg accuracy"
          value={summary?.avg_accuracy != null ? `${summary.avg_accuracy}%` : "—"}
          hint="class, all-time"
        />
        <StatTile
          label="Slipping"
          value={summary ? String(summary.slipping_count) : "—"}
          hint="no activity 5d+"
          tone={summary && summary.slipping_count > 0 ? "correction" : "default"}
        />
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

      {dash.isPending ? (
        <p className="font-body text-sm text-ink-soft">Loading the class…</p>
      ) : students.length === 0 ? (
        <p className="rounded-md border border-border bg-surface px-3.5 py-4 font-body text-sm text-ink-soft shadow-sm">
          No students yet. Add one from the Students tab.
        </p>
      ) : (
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
              {students.map((s) => (
                <tr
                  key={s.id}
                  className={`border-b border-grid-line ${s.slipping ? "bg-correction-soft" : ""}`}
                >
                  <td className="px-4 py-2.5 font-display text-sm font-semibold text-ink">
                    {s.display_name}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-center font-mono text-[13px] font-bold ${
                      s.current_streak ? "text-check" : "text-ink-faint"
                    }`}
                  >
                    {s.current_streak || "—"}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-center font-mono text-xs ${
                      s.slipping ? "text-correction" : "text-ink-soft"
                    }`}
                  >
                    {lastActiveLabel(s)}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-center font-mono text-[13px] font-bold ${
                      s.due_count > 10 ? "text-correction" : "text-ink"
                    }`}
                  >
                    {s.due_count}
                  </td>
                  <td className="px-4 py-2.5 text-center font-mono text-[13px] text-ink-soft">
                    {s.reviewed_week}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-center font-mono text-[13px] font-bold ${
                      s.accuracy == null
                        ? "text-ink-faint"
                        : s.accuracy >= 80
                          ? "text-check"
                          : "text-correction"
                    }`}
                  >
                    {s.accuracy == null ? "—" : `${s.accuracy}%`}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {s.slipping ? (
                      <Badge tone="correction">nudge</Badge>
                    ) : (
                      <Badge tone="check">on track</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {decks.length > 0 ? (
        <div className="mt-7">
          <div className="mb-2.5 flex items-center gap-2">
            <span className="text-pen">
              <Icon name="layers" size={16} />
            </span>
            <h2 className="m-0 font-display text-[15px] font-bold text-ink">Deck progress</h2>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
              {decks.length} {decks.length === 1 ? "deck" : "decks"}
            </span>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {decks.map((d) => (
              <div key={d.id} className="rounded-lg border border-border bg-surface p-4 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-display text-sm font-semibold text-ink">
                      {d.name}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                      {d.exam_tag ?? `${d.card_count} ${d.card_count === 1 ? "card" : "cards"}`}
                    </div>
                  </div>
                  <span className="font-mono text-lg font-bold tabular-nums text-ink">
                    {d.mastered_pct == null ? "—" : `${d.mastered_pct}%`}
                  </span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-grid-line">
                  <div
                    className="h-full rounded-full bg-check"
                    style={{ width: `${d.mastered_pct ?? 0}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between font-mono text-[10.5px] text-ink-faint">
                  <span>
                    {d.students_assigned} {d.students_assigned === 1 ? "student" : "students"}
                  </span>
                  <span>learned</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const EMPTY_DRAFT = { term: "", meaning: "", ipa: "", example_sentence: "" };
type Draft = typeof EMPTY_DRAFT;

/** Deck selector + inline "new deck" create. The card being added always lands
 * in exactly one deck, so the teacher must have one selected before saving. */
function DeckBar({
  decks,
  value,
  onChange,
}: {
  decks: Deck[];
  value: number | null;
  onChange: (id: number) => void;
}) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [examTag, setExamTag] = useState("");

  const create = useMutation({
    mutationFn: () => admin.createDeck({ name: name.trim(), exam_tag: examTag.trim() || undefined }),
    onSuccess: (deck) => {
      qc.invalidateQueries({ queryKey: ["admin-decks"] });
      onChange(deck.id);
      setCreating(false);
      setName("");
      setExamTag("");
    },
  });

  if (creating) {
    return (
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <EditField label="Deck name" value={name} onChange={setName} placeholder="e.g. Entrance Exam — Core 300" />
        <EditField label="Exam tag" value={examTag} onChange={setExamTag} mono placeholder="grade-10-entrance" />
        <Button variant="primary" onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
          {create.isPending ? "Creating…" : "Create deck"}
        </Button>
        <Button variant="ghost" onClick={() => setCreating(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <label className="mb-4 block">
      <span className="mb-1 block font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
        Adding to deck
      </span>
      <div className="flex gap-2">
        <select
          value={value ?? ""}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-10 flex-1 rounded-md border border-border bg-surface px-3 font-body text-[15px] text-ink outline-none focus:border-pen"
        >
          {decks.length === 0 ? <option value="">No decks yet — create one</option> : null}
          {decks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
              {d.exam_tag ? ` · ${d.exam_tag}` : ""}
            </option>
          ))}
        </select>
        <Button variant="secondary" onClick={() => setCreating(true)}>
          New deck
        </Button>
      </div>
    </label>
  );
}

/** After a card is saved, the teacher pushes the deck to students. Whole-class or
 * one student, with an optional daily new-card target (blank = student default). */
function AssignPanel({ deckId }: { deckId: number | null }) {
  const studentsQuery = useQuery({ queryKey: ["admin-students"], queryFn: admin.students });
  const students = studentsQuery.data ?? [];
  const [target, setTarget] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const parsedTarget = target.trim() ? Number(target) : null;

  const assignClass = useMutation({
    mutationFn: () => admin.assignClass(deckId!, parsedTarget),
    onSuccess: (rows) => setNote(`Assigned to ${rows.length} student${rows.length === 1 ? "" : "s"}.`),
  });
  const assignOne = useMutation({
    mutationFn: (studentId: number) => admin.assign(studentId, deckId!, parsedTarget),
    onSuccess: (_r, studentId) =>
      setNote(`Assigned to ${students.find((s) => s.id === studentId)?.display_name ?? "student"}.`),
  });

  const busy = assignClass.isPending || assignOne.isPending;
  const err = (assignClass.error ?? assignOne.error) as ApiError | null;

  return (
    <div className="mt-[18px] rounded-md border border-border bg-surface p-4 shadow-sm">
      <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
        Assign this deck
      </p>

      <div className="mb-3 flex items-end gap-2">
        <div className="w-28">
          <EditField
            label="Daily target"
            value={target}
            onChange={setTarget}
            mono
            placeholder="default"
          />
        </div>
        <Button
          variant="primary"
          size="sm"
          disabled={deckId == null || busy}
          onClick={() => {
            setNote(null);
            assignClass.mutate();
          }}
        >
          Whole class
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {studentsQuery.isPending ? (
          <span className="font-body text-[13px] text-ink-faint">Loading students…</span>
        ) : students.length === 0 ? (
          <span className="font-body text-[13px] text-ink-faint">No students yet.</span>
        ) : (
          students.map((s) => (
            <button
              key={s.id}
              disabled={deckId == null || busy}
              onClick={() => {
                setNote(null);
                assignOne.mutate(s.id);
              }}
              className="rounded-full border border-border bg-surface px-2.5 py-1 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-ink-soft hover:border-pen hover:text-pen disabled:opacity-40"
            >
              {s.display_name.split(" ")[0]}
            </button>
          ))
        )}
      </div>

      {note ? <p className="mt-2.5 font-body text-[13px] text-check">{note}</p> : null}
      {err ? (
        <p role="alert" className="mt-2.5 font-body text-[13px] text-correction">
          Couldn&rsquo;t assign — {err.message}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Fast add (SoW §4, the <10s/word loop): pick a deck, type a term, let AI draft
 * meaning/IPA/example, edit, save. AI is a convenience — if enrichment is
 * unavailable (no key → 503) the teacher just fills the fields by hand. Nothing
 * from the AI path auto-saves; the teacher approves every card.
 */
function AddVocab() {
  const qc = useQueryClient();
  const decksQuery = useQuery({ queryKey: ["admin-decks"], queryFn: admin.decks });
  const decks = decksQuery.data ?? [];

  const [pickedDeck, setPickedDeck] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [source, setSource] = useState<"manual" | "ai-enriched">("manual");
  const [saved, setSaved] = useState<string | null>(null);

  // Default to the first deck until the teacher picks another.
  const deckId = pickedDeck ?? decks[0]?.id ?? null;
  const deck = decks.find((d) => d.id === deckId) ?? null;

  const enrich = useMutation({
    mutationFn: (term: string) => admin.enrich(term),
    onSuccess: (r) => {
      setDraft({ term: r.term, meaning: r.meaning, ipa: r.ipa, example_sentence: r.example_sentence });
      setSource("ai-enriched");
    },
  });

  const save = useMutation({
    mutationFn: () =>
      admin.createCard(deckId!, {
        term: draft.term.trim(),
        meaning: draft.meaning.trim(),
        ipa: draft.ipa.trim() || null,
        example_sentence: draft.example_sentence.trim() || null,
        source,
      }),
    onSuccess: (card) => {
      qc.invalidateQueries({ queryKey: ["admin-decks"] });
      qc.invalidateQueries({ queryKey: ["admin-cards", deckId] });
      setSaved(`Saved “${card.term}”.`);
      setDraft(EMPTY_DRAFT);
      setSource("manual");
      enrich.reset();
    },
  });

  function set(field: keyof Draft, v: string) {
    setDraft((d) => ({ ...d, [field]: v }));
    setSaved(null);
  }

  function runEnrich() {
    if (!draft.term.trim()) return;
    setSaved(null);
    enrich.mutate(draft.term.trim());
  }

  const enrichUnavailable = enrich.error instanceof ApiError && enrich.error.status === 503;
  const canSave = deckId != null && draft.term.trim() !== "" && draft.meaning.trim() !== "" && !save.isPending;

  return (
    <div className="grid w-full gap-7 overflow-y-auto p-4 sm:p-7 lg:grid-cols-2">
      <div>
        <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
          {deck?.exam_tag ?? deck?.name ?? "Fast add"}
        </p>
        <h1 className="mt-1 mb-1.5 font-display text-[26px] font-extrabold tracking-tight text-ink">Fast add</h1>
        <p className="mb-[18px] max-w-[42ch] font-body text-[15px] text-ink-soft">
          Type a word, let AI draft the definition, IPA, and example. You review and edit before anything saves —
          nothing auto-publishes.
        </p>

        <DeckBar decks={decks} value={deckId} onChange={setPickedDeck} />

        <div className="mb-4 flex gap-2">
          <input
            value={draft.term}
            onChange={(e) => set("term", e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runEnrich()}
            placeholder="e.g. ambitious"
            className="h-11 flex-1 rounded-md border border-border bg-surface px-3.5 font-display text-[15px] text-ink outline-none focus:border-pen"
          />
          <Button variant="primary" onClick={runEnrich} disabled={!draft.term.trim() || enrich.isPending}>
            {enrich.isPending ? "Enriching…" : "Enrich"}
          </Button>
        </div>

        {enrichUnavailable ? (
          <p className="mb-3 rounded-md border border-border bg-surface px-3.5 py-2.5 font-body text-[13px] text-ink-soft">
            AI enrichment is off (no API key on the server). You can still fill the fields below by hand and save.
          </p>
        ) : enrich.isError ? (
          <p role="alert" className="mb-3 font-body text-[13px] text-correction">
            Couldn&rsquo;t draft this word — {(enrich.error as Error).message}
          </p>
        ) : null}

        <div className="flex flex-col gap-3">
          <EditField label="Meaning" value={draft.meaning} onChange={(v) => set("meaning", v)} multiline placeholder="a concise, learner-friendly definition" />
          <EditField label="IPA" value={draft.ipa} onChange={(v) => set("ipa", v)} mono placeholder="æmˈbɪʃəs" />
          <EditField label="Example" value={draft.example_sentence} onChange={(v) => set("example_sentence", v)} multiline placeholder="a natural sentence using the word" />

          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={() => save.mutate()} disabled={!canSave}>
              {save.isPending ? "Saving…" : "Save card"}
            </Button>
            {source === "ai-enriched" ? (
              <Button variant="secondary" onClick={runEnrich} disabled={enrich.isPending}>
                Regenerate
              </Button>
            ) : null}
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(EMPTY_DRAFT);
                setSource("manual");
                setSaved(null);
                enrich.reset();
              }}
            >
              Clear
            </Button>
            {saved ? <span className="font-body text-[13px] text-check">{saved}</span> : null}
            {save.isError ? (
              <span role="alert" className="font-body text-[13px] text-correction">
                {(save.error as Error).message}
              </span>
            ) : null}
          </div>
          {deckId == null ? (
            <p className="font-body text-[13px] italic text-ink-faint">Create or pick a deck to save into.</p>
          ) : null}
        </div>
      </div>

      <div>
        <p className="mb-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
          Live preview
        </p>
        <Flashcard
          tag={deck?.exam_tag ? <Badge tone="pen">{deck.exam_tag}</Badge> : undefined}
          term={draft.term.trim() || "ambitious"}
          ipa={draft.ipa.trim() || (draft.term ? undefined : "æmˈbɪʃəs")}
          meaning={draft.meaning.trim() || "having a strong desire to succeed or achieve something"}
          example={draft.example_sentence.trim() || (draft.term ? undefined : "She's ambitious about passing the entrance exam this year.")}
        />
        <AssignPanel deckId={deckId} />
      </div>
    </div>
  );
}

// Common timezones for the ~12-student cohort; keeps the teacher from typo-ing an
// IANA name the streak/reminder logic depends on. Default matches the backend.
const TIMEZONES = [
  "Asia/Ho_Chi_Minh",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/London",
  "UTC",
];

const EMPTY_STUDENT = {
  display_name: "",
  email: "",
  password: "",
  timezone: "Asia/Ho_Chi_Minh",
  daily_new_target: "10",
};
type StudentDraft = typeof EMPTY_STUDENT;

/** Register a student (SoW §4): the only way accounts are created — there is no
 * self-signup, so the teacher provisions each login here and shares the
 * credentials. Sets the student's timezone up front, since it drives the streak
 * day boundary and the daily reminder hour (M5). */
function AddStudentForm() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<StudentDraft>(EMPTY_STUDENT);
  const [saved, setSaved] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      admin.createStudent({
        display_name: draft.display_name.trim(),
        email: draft.email.trim(),
        password: draft.password,
        timezone: draft.timezone,
        daily_new_target: draft.daily_new_target.trim() ? Number(draft.daily_new_target) : undefined,
      }),
    onSuccess: (student) => {
      qc.invalidateQueries({ queryKey: ["admin-students"] });
      setSaved(`Created ${student.display_name}. Share the email and password with them.`);
      setDraft(EMPTY_STUDENT);
    },
  });

  const err = create.error as ApiError | null;
  const canSave =
    draft.display_name.trim() !== "" &&
    draft.email.trim() !== "" &&
    draft.password.length >= 8 &&
    !create.isPending;

  function set(field: keyof StudentDraft, v: string) {
    setDraft((d) => ({ ...d, [field]: v }));
    setSaved(null);
  }

  return (
    <div className="mb-6 rounded-lg border border-border bg-surface p-4 shadow-card sm:p-5">
      <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
        Add a student
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <EditField label="Full name" value={draft.display_name} onChange={(v) => set("display_name", v)} placeholder="Mai Nguyen" />
        <EditField label="Email" value={draft.email} onChange={(v) => set("email", v)} mono placeholder="mai@lexi.app" />
        <EditField label="Temporary password" value={draft.password} onChange={(v) => set("password", v)} mono placeholder="at least 8 characters" />
        <label className="block">
          <span className="mb-1 block font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
            Timezone
          </span>
          <select
            value={draft.timezone}
            onChange={(e) => set("timezone", e.target.value)}
            className="h-[42px] w-full rounded-md border border-border bg-surface px-3 font-body text-[15px] text-ink outline-none focus:border-pen"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <div className="w-32">
          <EditField label="Daily new target" value={draft.daily_new_target} onChange={(v) => set("daily_new_target", v)} mono placeholder="10" />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => create.mutate()} disabled={!canSave}>
          {create.isPending ? "Creating…" : "Create student"}
        </Button>
        {draft.password !== "" && draft.password.length < 8 ? (
          <span className="font-body text-[13px] text-ink-faint">Password needs at least 8 characters.</span>
        ) : null}
        {saved ? <span className="font-body text-[13px] text-check">{saved}</span> : null}
        {err ? (
          <span role="alert" className="font-body text-[13px] text-correction">
            {err.message}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Roster + per-student daily new-card target (SoW §4 curriculum control), plus
 * the teacher-only "add student" form — the sole account-creation path (no
 * self-signup). */
function Students() {
  const qc = useQueryClient();
  const studentsQuery = useQuery({ queryKey: ["admin-students"], queryFn: admin.students });
  const students = studentsQuery.data ?? [];

  const update = useMutation({
    mutationFn: (v: { id: number; daily_new_target: number }) =>
      admin.updateStudent(v.id, { daily_new_target: v.daily_new_target }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-students"] }),
  });

  return (
    <div className="w-full overflow-y-auto p-4 sm:p-7">
      <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
        Teacher-created accounts · no self-signup
      </p>
      <h1 className="mt-1 mb-5 font-display text-[26px] font-extrabold tracking-tight text-ink">Students</h1>

      <AddStudentForm />

      {studentsQuery.isPending ? (
        <p className="font-body text-sm text-ink-soft">Loading roster…</p>
      ) : studentsQuery.isError ? (
        <p role="alert" className="font-body text-sm text-correction">
          Couldn&rsquo;t load students — {(studentsQuery.error as Error).message}
        </p>
      ) : students.length === 0 ? (
        <p className="font-body text-sm text-ink-soft">No students yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-card">
          <table className="w-full min-w-[520px] border-collapse">
            <thead>
              <tr className="border-b border-border">
                {["Student", "Email", "Daily new target", ""].map((h, i) => (
                  <th
                    key={i}
                    className={`px-4 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-faint ${
                      i === 0 ? "text-left" : "text-left"
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <StudentRow
                  key={s.id}
                  student={s}
                  onSave={(target) => update.mutate({ id: s.id, daily_new_target: target })}
                  saving={update.isPending && update.variables?.id === s.id}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** One roster row — a local, editable copy of the daily target committed on Save. */
function StudentRow({
  student,
  onSave,
  saving,
}: {
  student: UserOut;
  onSave: (target: number) => void;
  saving: boolean;
}) {
  const [target, setTarget] = useState(String(student.daily_new_target));
  const dirty = target.trim() !== "" && Number(target) !== student.daily_new_target;

  return (
    <tr className="border-b border-grid-line">
      <td className="px-4 py-2.5 font-display text-sm font-semibold text-ink">{student.display_name}</td>
      <td className="px-4 py-2.5 font-mono text-xs text-ink-soft">{student.email}</td>
      <td className="px-4 py-2.5">
        <input
          type="number"
          min={0}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="h-8 w-20 rounded-md border border-border bg-surface px-2 font-mono text-[13px] text-ink outline-none focus:border-pen"
        />
      </td>
      <td className="px-4 py-2.5">
        <Button variant="secondary" size="sm" disabled={!dirty || saving} onClick={() => onSave(Number(target))}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </td>
    </tr>
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
