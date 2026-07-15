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
import { admin, ApiError, type Deck, type UserOut } from "@/lib/api/client";
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

/** Roster + per-student daily new-card target (SoW §4 curriculum control).
 * Accounts are teacher-created; no self-signup, so this is read + tune, not add. */
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
