"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Flashcard } from "@/components/ui/Flashcard";
import { GradeButtons, type Grade } from "@/components/ui/GradeButtons";
import { Icon } from "@/components/ui/Icon";
import { StatTile } from "@/components/ui/StatTile";
import { SignOutButton } from "@/components/ui/SignOutButton";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import {
  api,
  decks as decksApi,
  quiz as quizApi,
  review as reviewApi,
  type AssignedDeck,
  type QuizAnswerResult,
} from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";

/**
 * StudentApp — the phone-first daily loop from SoW §3: open app → Review Today
 * (due cards, grade) → short quiz → streak ticks up. Built entirely around the
 * signature Flashcard.
 *
 * Home reads real decks / due counts / streak; Review runs the FSRS loop
 * (`/review/due` + `/review/grade`); the Quiz screen runs the M4 quiz
 * (`/quiz` + `/quiz/answer`), whose answers feed the same scheduler.
 */

type Streak = { current_streak: number; longest_streak: number; freezes_remaining: number };

/** What the quiz reports back to the session when it finishes. */
type QuizStats = { correct: number; total: number; elapsedMs: number };

type Screen = "home" | "review" | "quiz" | "done" | "vocab";

/** Format a duration in ms as `m:ss`. */
function clock(ms: number): string {
  const secs = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

/** A live count-up since mount, ticking once a second — the optional session
 * timer from SoW §4. Purely cosmetic; grading uses its own per-question timing. */
function useSessionTimer(): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setElapsed(Date.now() - start), 1000);
    return () => clearInterval(id);
  }, []);
  return elapsed;
}

/**
 * Streak freezes (M5): each banked freeze silently covers one missed day so a
 * single skip doesn't reset the streak. Shown so the student knows the safety
 * net exists — and that it's finite.
 */
function FreezeChip({ count }: { count: number }) {
  const pips = Math.max(count, 1); // always draw at least one glyph to anchor the row
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-border bg-surface px-3.5 py-2.5 shadow-sm">
      <span className="flex items-center gap-0.5 text-pen">
        {Array.from({ length: pips }).map((_, i) => (
          <Icon
            key={i}
            name="snowflake"
            size={15}
            style={count === 0 ? { opacity: 0.3 } : undefined}
          />
        ))}
      </span>
      <span className="font-body text-[13px] text-ink-soft">
        {count > 0
          ? `${count} streak ${count === 1 ? "freeze" : "freezes"} — each covers a missed day.`
          : "No freezes left — review today to keep your streak."}
      </span>
    </div>
  );
}

/** "3 cards due — about two minutes." Sell the session small; ~25s a card. */
function dueBlurb(due: number): string {
  if (due === 0) return "Nothing due right now. Enjoy the day off.";
  const minutes = Math.max(1, Math.round((due * 25) / 60));
  const cards = due === 1 ? "1 card" : `${due} cards`;
  const time = minutes === 1 ? "about a minute" : `about ${minutes} minutes`;
  return `${cards} due — ${time}.`;
}

/**
 * Persistent app bar. Theme + sign out live here rather than on the Home screen
 * only, so they stay reachable mid-review.
 */
function TopBar({
  title,
  onBack,
  right,
}: {
  title?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-10 border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-2.5 px-4 py-3 sm:px-6">
        {onBack ? (
          <button
            onClick={onBack}
            aria-label="Back"
            className="flex border-0 bg-transparent p-0 text-ink-soft hover:text-ink"
          >
            <Icon name="chevronLeft" size={22} />
          </button>
        ) : (
          <span className="font-display text-xl font-extrabold tracking-tight text-pen">
            Lexi<span className="text-correction">.</span>
          </span>
        )}
        {title ? (
          <span className="font-display text-[15px] font-bold text-ink">{title}</span>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          {right}
          <ThemeToggle />
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}

/** Page content column — a phone-width column on mobile, roomier on desktop. */
function Content({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
      {children}
    </div>
  );
}

function Home({ onReview, onManageVocab }: { onReview: () => void; onManageVocab: () => void }) {
  const { user } = useAuth();

  const decksQuery = useQuery({ queryKey: ["decks"], queryFn: decksApi.listMine });
  const streakQuery = useQuery({
    queryKey: ["streak"],
    queryFn: () => api<Streak>("/me/streak"),
  });

  const myDecks = decksQuery.data ?? [];
  const classDecks = myDecks.filter((d) => !d.owned);
  const personalDecks = myDecks.filter((d) => d.owned);
  const totalDue = myDecks.reduce((sum, d) => sum + d.due_count, 0);
  const totalCards = myDecks.reduce((sum, d) => sum + d.card_count, 0);
  const streak = streakQuery.data?.current_streak ?? 0;
  const longest = streakQuery.data?.longest_streak ?? 0;
  const freezes = streakQuery.data?.freezes_remaining ?? 0;
  const firstName = user?.display_name.split(" ")[0] ?? "there";

  return (
    <div>
      <TopBar
        right={
          <span className="mr-1 flex items-center gap-1 font-mono text-[13px] font-bold text-check">
            <Icon name="flame" size={17} fill="var(--check-soft)" />
            {streak}
          </span>
        }
      />
      <Content>
        <div>
          <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
            Your review
          </p>
          <h1 className="mt-1 font-display text-[26px] font-extrabold tracking-tight text-ink sm:text-3xl">
            Ready, {firstName}?
          </h1>
          <p className="mt-1 font-body text-[15px] text-ink-soft sm:text-base">
            {decksQuery.isPending ? "Checking what's due…" : dueBlurb(totalDue)}
          </p>
        </div>

        {decksQuery.isError ? (
          <p
            role="alert"
            className="rounded-md border border-correction bg-correction-soft px-3.5 py-2.5 font-body text-sm text-correction"
          >
            Couldn&rsquo;t load your decks. Check your connection and try again.
          </p>
        ) : null}

        <div className="grid grid-cols-3 gap-2.5">
          <StatTile
            label="Streak"
            value={String(streak)}
            hint={longest > streak ? `best ${longest}` : streak === 1 ? "day" : "days"}
            tone={streak > 0 ? "check" : "default"}
          />
          <StatTile
            label="Due"
            value={String(totalDue)}
            hint="cards"
            tone={totalDue > 0 ? "correction" : "default"}
          />
          <StatTile label="Assigned" value={String(totalCards)} hint="cards" />
        </div>

        {streakQuery.isSuccess ? <FreezeChip count={freezes} /> : null}

        <button
          onClick={onReview}
          disabled={totalDue === 0}
          className="flex items-center gap-3 rounded-xl border-0 bg-pen px-5 py-[18px] text-left text-white shadow-card transition-[filter] hover:brightness-110 disabled:pointer-events-none disabled:opacity-40"
        >
          <div className="flex-1">
            <div className="font-display text-lg font-bold">Review Today</div>
            <div className="font-body text-[13px] opacity-85">Due cards + a short quiz</div>
          </div>
          <Icon name="arrowRight" size={22} />
        </button>

        <div>
          <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
            Class decks
          </p>

          {!decksQuery.isPending && classDecks.length === 0 ? (
            <div className="rounded-md border border-border bg-surface px-3.5 py-4 font-body text-sm text-ink-soft shadow-sm">
              No class decks yet. Your teacher will assign one after your next lesson.
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {classDecks.map((d) => (
                <DeckRow key={d.id} deck={d} />
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
              My vocabulary
            </p>
            <button
              onClick={onManageVocab}
              className="flex items-center gap-1 border-0 bg-transparent p-0 font-display text-[13px] font-semibold text-pen hover:underline"
            >
              <Icon name="plus" size={15} />
              Add &amp; manage
            </button>
          </div>

          {personalDecks.length === 0 ? (
            <button
              onClick={onManageVocab}
              className="flex w-full items-center gap-3 rounded-md border border-dashed border-border bg-surface px-3.5 py-4 text-left font-body text-sm text-ink-soft shadow-sm hover:border-pen hover:text-ink"
            >
              <Icon name="plus" size={18} />
              Add your own words — build a personal deck to study alongside class decks.
            </button>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {personalDecks.map((d) => (
                <DeckRow key={d.id} deck={d} onClick={onManageVocab} />
              ))}
            </div>
          )}
        </div>
      </Content>
    </div>
  );
}

/** One deck row on Home. Optional `onClick` makes it a button (personal decks
 * jump into the authoring screen); class decks are static. */
function DeckRow({ deck, onClick }: { deck: AssignedDeck; onClick?: () => void }) {
  const inner = (
    <>
      <span className="text-ink-faint">
        <Icon name="layers" size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-sm font-semibold text-ink">{deck.name}</div>
        <div className="mt-0.5 font-mono text-[10.5px] uppercase tracking-wider text-ink-faint">
          {deck.exam_tag ?? `${deck.card_count} ${deck.card_count === 1 ? "card" : "cards"}`}
        </div>
      </div>
      <Badge tone={deck.due_count ? "correction" : "check"}>
        {deck.due_count ? `${deck.due_count} due` : "done"}
      </Badge>
    </>
  );
  const cls =
    "flex w-full items-center gap-3 rounded-md border border-border bg-surface px-3.5 py-3 text-left shadow-sm";
  return onClick ? (
    <button onClick={onClick} className={`${cls} hover:border-pen`}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/** A centered message with a way back — used for the load/error/empty states. */
function ReviewNotice({
  onBack,
  children,
  tone = "default",
}: {
  onBack: () => void;
  children: React.ReactNode;
  tone?: "default" | "error";
}) {
  return (
    <div>
      <TopBar title="Review Today" onBack={onBack} />
      <Content>
        <div className="mx-auto mt-8 w-full max-w-xl text-center">
          <p
            role={tone === "error" ? "alert" : undefined}
            className={
              tone === "error"
                ? "rounded-md border border-correction bg-correction-soft px-3.5 py-2.5 font-body text-sm text-correction"
                : "font-body text-[15px] text-ink-soft"
            }
          >
            {children}
          </p>
        </div>
      </Content>
    </div>
  );
}

/**
 * Owns the whole review session: fetches the due queue once (a snapshot the
 * student works through), reveals each card, and posts each grade to the FSRS
 * scheduler. Cards graded "again" come back on the next session load, not within
 * this pass — a single sweep keeps the daily loop short (SoW §3).
 */
function Review({ onFinish, onBack }: { onFinish: (reviewed: number) => void; onBack: () => void }) {
  const qc = useQueryClient();
  const dueQuery = useQuery({ queryKey: ["review-due"], queryFn: reviewApi.due, staleTime: 0 });
  const grade = useMutation({
    mutationFn: (v: { cardId: number; rating: Grade; elapsedMs: number }) =>
      reviewApi.grade(v.cardId, v.rating, v.elapsedMs),
  });

  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  // When the answer was revealed, so we can report how long grading took. Set in
  // the reveal handler (never during render, which must stay pure).
  const shownAt = useRef<number>(0);

  if (dueQuery.isPending) {
    return <ReviewNotice onBack={onBack}>Loading your cards…</ReviewNotice>;
  }
  if (dueQuery.isError) {
    return (
      <ReviewNotice onBack={onBack} tone="error">
        Couldn&rsquo;t load your review. Check your connection and try again.
      </ReviewNotice>
    );
  }

  const cards = dueQuery.data;
  if (cards.length === 0) {
    return <ReviewNotice onBack={onBack}>Nothing due right now — enjoy the day off.</ReviewNotice>;
  }

  const card = cards[idx];
  const total = cards.length;

  async function onGrade(rating: Grade) {
    if (grade.isPending) return; // ignore rapid double-taps on one card
    try {
      await grade.mutateAsync({
        cardId: card.card_id,
        rating,
        elapsedMs: Date.now() - shownAt.current,
      });
    } catch {
      // Leave the card in place so the student can retry the grade.
      return;
    }
    if (idx + 1 < total) {
      setIdx(idx + 1);
      setRevealed(false);
    } else {
      // Refresh Home's due counts and streak for when we land back there.
      qc.invalidateQueries({ queryKey: ["decks"] });
      qc.invalidateQueries({ queryKey: ["streak"] });
      onFinish(total);
    }
  }

  return (
    <div>
      <TopBar
        title="Review Today"
        onBack={onBack}
        right={
          <span className="font-mono text-xs font-semibold text-ink-faint">
            {idx + 1}/{total}
          </span>
        }
      />
      <div className="h-1 bg-grid-line">
        <div
          className="h-full bg-check transition-[width] duration-300 ease-[var(--ease-standard)]"
          style={{ width: `${(idx / total) * 100}%` }}
        />
      </div>
      <Content>
        {/* The card is the focus, so keep it from stretching wide on a monitor. */}
        <div className="mx-auto w-full max-w-xl">
          {!revealed ? (
            <button
              onClick={() => {
                shownAt.current = Date.now();
                setRevealed(true);
              }}
              className="w-full cursor-pointer text-left"
              aria-label={`Reveal the meaning of ${card.term}`}
            >
              <Flashcard
                tag={<Badge tone="correction">due now</Badge>}
                term={card.term}
                ipa={card.ipa ?? undefined}
                meaning="Tap to reveal the meaning"
              />
            </button>
          ) : (
            <Flashcard
              tag={card.exam_tag ? <Badge tone="pen">{card.exam_tag}</Badge> : undefined}
              term={card.term}
              ipa={card.ipa ?? undefined}
              meaning={card.meaning}
              example={card.example_sentence ?? undefined}
              footer={
                <div>
                  <p className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-faint">
                    How well did you know it?
                  </p>
                  <GradeButtons onGrade={onGrade} />
                  {grade.isError ? (
                    <p role="alert" className="mt-2 font-body text-[13px] text-correction">
                      Couldn&rsquo;t save that grade — tap again to retry.
                    </p>
                  ) : null}
                </div>
              }
            />
          )}

          {!revealed ? (
            <p className="mt-4 text-center font-body text-[13px] text-ink-faint">
              Recall the meaning, then tap the card.
            </p>
          ) : null}
        </div>
      </Content>
    </div>
  );
}

/** A centered notice for the quiz's load/error/empty states, with a way onward. */
function QuizNotice({
  children,
  onBack,
  action,
  tone = "default",
}: {
  children: React.ReactNode;
  onBack: () => void;
  action?: React.ReactNode;
  tone?: "default" | "error";
}) {
  return (
    <div>
      <TopBar title="Quick quiz" onBack={onBack} />
      <Content>
        <div className="mx-auto mt-8 w-full max-w-xl text-center">
          <p
            role={tone === "error" ? "alert" : undefined}
            className={
              tone === "error"
                ? "rounded-md border border-correction bg-correction-soft px-3.5 py-2.5 font-body text-sm text-correction"
                : "font-body text-[15px] text-ink-soft"
            }
          >
            {children}
          </p>
          {action ? <div className="mt-5">{action}</div> : null}
        </div>
      </Content>
    </div>
  );
}

/**
 * Owns a quiz session: fetches a short quiz once, presents each question (MCQ or
 * type-the-answer), and posts each answer to `/quiz/answer` — where a miss grades
 * `again` and a hit grades `good`, both feeding the FSRS scheduler (SoW §4). Cards
 * that come back wrong are rescheduled by the server, not re-asked this pass.
 */
function Quiz({ onFinish, onBack }: { onFinish: (stats: QuizStats) => void; onBack: () => void }) {
  const quizQuery = useQuery({ queryKey: ["quiz"], queryFn: quizApi.get, staleTime: 0 });
  const answer = useMutation({
    mutationFn: (v: { cardId: number; token: string; answer: string; elapsedMs: number }) =>
      quizApi.answer(v.cardId, v.token, v.answer, v.elapsedMs),
  });

  const [idx, setIdx] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  // The current question's graded verdict (null until the student answers).
  const [result, setResult] = useState<QuizAnswerResult | null>(null);
  // What the student chose/typed, so the answered UI can mark it right or wrong.
  const [chosen, setChosen] = useState<string>("");
  const [typed, setTyped] = useState("");
  // When the current question was first shown, so we can report per-question
  // timing. Stamped in an effect (never during render, which must stay pure).
  const shownAt = useRef<number>(0);
  const elapsed = useSessionTimer();

  useEffect(() => {
    shownAt.current = Date.now();
  }, [idx]);

  if (quizQuery.isPending) {
    return <QuizNotice onBack={onBack}>Building your quiz…</QuizNotice>;
  }
  if (quizQuery.isError) {
    return (
      <QuizNotice onBack={onBack} tone="error">
        Couldn&rsquo;t load your quiz. Check your connection and try again.
      </QuizNotice>
    );
  }

  const questions = quizQuery.data;
  if (questions.length === 0) {
    return (
      <QuizNotice
        onBack={onBack}
        action={
          <Button
            variant="primary"
            onClick={() => onFinish({ correct: 0, total: 0, elapsedMs: elapsed })}
          >
            Finish session
          </Button>
        }
      >
        No quiz yet — review a few cards first and they&rsquo;ll show up here.
      </QuizNotice>
    );
  }

  const q = questions[idx];
  const total = questions.length;
  const answered = result !== null;

  async function submit(value: string, elapsedMs: number) {
    if (answer.isPending || answered || !value.trim()) return;
    setChosen(value);
    try {
      const verdict = await answer.mutateAsync({
        cardId: q.card_id,
        token: q.token,
        answer: value,
        elapsedMs,
      });
      setResult(verdict);
      if (verdict.correct) setCorrectCount((c) => c + 1);
    } catch {
      // Leave the question answerable so the student can retry.
      setChosen("");
    }
  }

  function next() {
    if (idx + 1 < total) {
      // `shownAt` restamps via the effect on `idx`.
      setIdx(idx + 1);
      setResult(null);
      setChosen("");
      setTyped("");
    } else {
      onFinish({ correct: correctCount, total, elapsedMs: elapsed });
    }
  }

  return (
    <div>
      <TopBar
        title="Quick quiz"
        onBack={onBack}
        right={
          <span className="flex items-center gap-1 font-mono text-xs text-ink-faint">
            <Icon name="clock" size={15} />
            {clock(elapsed)}
          </span>
        }
      />
      <div className="h-1 bg-grid-line">
        <div
          className="h-full bg-check transition-[width] duration-300 ease-[var(--ease-standard)]"
          style={{ width: `${(idx / total) * 100}%` }}
        />
      </div>
      <Content>
        <div className="mx-auto w-full max-w-xl">
          {q.kind === "mcq" ? (
            <>
              <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-pen">
                Which meaning matches this word?
              </p>
              <h2 className="mt-2 mb-0.5 font-display text-3xl font-extrabold tracking-tight text-ink">
                {q.term}
              </h2>
              {q.ipa ? <span className="font-mono text-sm text-ink-faint">/{q.ipa}/</span> : null}

              <div className="mt-4 flex flex-col gap-2.5">
                {(q.options ?? []).map((o) => {
                  const showRight = answered && o === result.correct_answer;
                  const showWrong = answered && o === chosen && o !== result.correct_answer;
                  const toneClass = showRight
                    ? "border-check bg-check-soft text-check"
                    : showWrong
                      ? "border-correction bg-correction-soft text-correction"
                      : "border-border bg-surface text-ink hover:border-pen";
                  return (
                    <button
                      key={o}
                      disabled={answered || answer.isPending}
                      onClick={() => submit(o, Date.now() - shownAt.current)}
                      className={`flex items-center gap-2.5 rounded-md border-[1.5px] px-4 py-3.5 text-left font-body text-[15px] shadow-sm transition-colors ${
                        answered ? "cursor-default" : "cursor-pointer"
                      } ${toneClass}`}
                    >
                      <span className="flex-1">{o}</span>
                      {showRight ? <Icon name="check" size={18} /> : null}
                      {showWrong ? <Icon name="x" size={18} /> : null}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-pen">
                Type the word that fits this meaning
              </p>
              <h2 className="mt-2 mb-1 font-display text-2xl font-bold tracking-tight text-ink">
                {q.meaning}
              </h2>
              {q.example_sentence ? (
                <p className="mt-1 font-body text-[15px] italic text-ink-soft">
                  “{q.example_sentence}”
                </p>
              ) : null}

              <form
                className="mt-4 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit(typed, Date.now() - shownAt.current);
                }}
              >
                <input
                  autoFocus
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  disabled={answered}
                  placeholder="Type your answer…"
                  aria-label="Your answer"
                  className="h-12 flex-1 rounded-md border-[1.5px] border-border bg-surface px-4 font-body text-[15px] text-ink shadow-sm outline-none focus:border-pen disabled:opacity-70"
                />
                {!answered ? (
                  <Button
                    variant="primary"
                    type="submit"
                    disabled={!typed.trim() || answer.isPending}
                    className="h-12 px-5"
                  >
                    Check
                  </Button>
                ) : null}
              </form>

              {answered ? (
                <div
                  className={`mt-3 rounded-md border-[1.5px] px-4 py-3 font-body text-[15px] ${
                    result.correct
                      ? "border-check bg-check-soft text-check"
                      : "border-correction bg-correction-soft text-correction"
                  }`}
                >
                  {result.correct ? (
                    <span className="flex items-center gap-2">
                      <Icon name="check" size={18} /> Correct — {result.correct_answer}
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Icon name="x" size={18} /> The answer was “{result.correct_answer}”.
                    </span>
                  )}
                </div>
              ) : null}
            </>
          )}

          {answer.isError ? (
            <p role="alert" className="mt-3 font-body text-[13px] text-correction">
              Couldn&rsquo;t save that answer — try again.
            </p>
          ) : null}

          {answered ? (
            <Button variant="primary" onClick={next} className="mt-4 h-12 w-full">
              {idx + 1 < total ? "Next question" : "Finish session"}
            </Button>
          ) : null}
        </div>
      </Content>
    </div>
  );
}

function Done({
  reviewed,
  quiz,
  onHome,
}: {
  reviewed: number;
  quiz: QuizStats;
  onHome: () => void;
}) {
  // Streak comes from the API; the quiz score and session time are carried in
  // from the session itself.
  const streakQuery = useQuery({
    queryKey: ["streak"],
    queryFn: () => api<Streak>("/me/streak"),
  });
  const streak = streakQuery.data?.current_streak ?? 0;
  const longest = streakQuery.data?.longest_streak ?? 0;
  const freezes = streakQuery.data?.freezes_remaining ?? 0;
  const cards = reviewed === 1 ? "card" : "cards";
  const isBest = streak > 0 && streak >= longest;

  return (
    <div className="flex min-h-full flex-col">
      <TopBar />
      <div className="flex flex-1 flex-col items-center justify-center gap-[18px] px-4 py-12 text-center sm:py-16">
        <div className="flex h-[84px] w-[84px] items-center justify-center rounded-full bg-check-soft text-check">
          <Icon name="flame" size={44} fill="var(--check-soft)" />
        </div>
        <div>
          <h1 className="m-0 font-display text-[28px] font-extrabold tracking-tight text-ink">
            {streak > 0 ? `${streak}-day streak` : "Session complete"}
          </h1>
          <p className="mt-1.5 font-body text-base text-ink-soft">
            Done for today — {reviewed} {cards} reviewed. See you tomorrow.
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {isBest && streak > 1 ? (
              <span className="rounded-full bg-check-soft px-2.5 py-1 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-check">
                Personal best
              </span>
            ) : null}
            {freezes > 0 ? (
              <span className="flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-ink-soft">
                <Icon name="snowflake" size={13} />
                {freezes} {freezes === 1 ? "freeze" : "freezes"} banked
              </span>
            ) : null}
          </div>
        </div>
        <div className="grid w-full max-w-sm grid-cols-3 gap-2.5">
          <StatTile label="Reviewed" value={String(reviewed)} hint="cards" tone="check" />
          <StatTile
            label="Quiz"
            value={quiz.total > 0 ? `${quiz.correct}/${quiz.total}` : "—"}
            hint="correct"
            tone={quiz.total > 0 && quiz.correct === quiz.total ? "check" : "default"}
          />
          <StatTile label="Time" value={clock(quiz.elapsedMs)} hint="today" />
        </div>
        <Button variant="secondary" onClick={onHome} className="mt-1">
          Back to home
        </Button>
      </div>
    </div>
  );
}

const VOCAB_INPUT =
  "h-11 w-full rounded-md border border-border bg-surface px-3.5 font-body text-[15px] text-ink outline-none focus:border-pen";
const VOCAB_LABEL =
  "font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-faint";

/** Add one manually-authored word to a personal deck. AI enrichment is
 * teacher-only, so this is plain typing — term + meaning required, the rest
 * optional. Kept as its own component so its fields reset cleanly per add. */
function AddCardForm({ deckId }: { deckId: number }) {
  const qc = useQueryClient();
  const [term, setTerm] = useState("");
  const [meaning, setMeaning] = useState("");
  const [ipa, setIpa] = useState("");
  const [example, setExample] = useState("");

  const add = useMutation({
    mutationFn: () =>
      decksApi.addCard(deckId, {
        term: term.trim(),
        meaning: meaning.trim(),
        ipa: ipa.trim() || null,
        example_sentence: example.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deck-cards", deckId] });
      qc.invalidateQueries({ queryKey: ["decks"] });
      setTerm("");
      setMeaning("");
      setIpa("");
      setExample("");
    },
  });

  const canAdd = term.trim() !== "" && meaning.trim() !== "" && !add.isPending;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canAdd) add.mutate();
      }}
      className="rounded-lg border border-border bg-surface p-4 shadow-card"
    >
      <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
        Add a word
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={VOCAB_LABEL}>Word</span>
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="serendipity" className={VOCAB_INPUT} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={VOCAB_LABEL}>IPA (optional)</span>
          <input value={ipa} onChange={(e) => setIpa(e.target.value)} placeholder="ˌsɛrənˈdɪpɪti" className={`${VOCAB_INPUT} font-mono text-sm`} />
        </label>
      </div>
      <label className="mt-3 flex flex-col gap-1.5">
        <span className={VOCAB_LABEL}>Meaning</span>
        <input value={meaning} onChange={(e) => setMeaning(e.target.value)} placeholder="a pleasant surprise" className={VOCAB_INPUT} />
      </label>
      <label className="mt-3 flex flex-col gap-1.5">
        <span className={VOCAB_LABEL}>Example (optional)</span>
        <textarea value={example} onChange={(e) => setExample(e.target.value)} rows={2} placeholder="A lucky serendipity led her to the answer." className={`${VOCAB_INPUT} h-auto py-2.5`} />
      </label>
      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" variant="primary" disabled={!canAdd}>
          {add.isPending ? "Adding…" : "Add word"}
        </Button>
        {add.isError ? (
          <span role="alert" className="font-body text-[13px] text-correction">
            {(add.error as Error).message}
          </span>
        ) : null}
      </div>
    </form>
  );
}

/**
 * "My Vocabulary" — the self-serve authoring screen. A student creates personal
 * decks and types their own cards (manual only); each personal deck is
 * self-assigned server-side, so its words flow straight into Review Today
 * alongside teacher-assigned class decks.
 */
function Vocab({ onBack }: { onBack: () => void }) {
  const qc = useQueryClient();
  const decksQuery = useQuery({ queryKey: ["decks"], queryFn: decksApi.listMine });
  const personalDecks = (decksQuery.data ?? []).filter((d) => d.owned);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [newDeckName, setNewDeckName] = useState("");
  const deckId = selectedId ?? personalDecks[0]?.id ?? null;

  const createDeck = useMutation({
    mutationFn: (name: string) => decksApi.create({ name }),
    onSuccess: (deck) => {
      qc.invalidateQueries({ queryKey: ["decks"] });
      setSelectedId(deck.id);
      setNewDeckName("");
    },
  });

  const cardsQuery = useQuery({
    queryKey: ["deck-cards", deckId],
    queryFn: () => decksApi.cards(deckId as number),
    enabled: deckId != null,
  });
  const removeCard = useMutation({
    mutationFn: (cardId: number) => decksApi.deleteCard(deckId as number, cardId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deck-cards", deckId] });
      qc.invalidateQueries({ queryKey: ["decks"] });
    },
  });

  const cards = cardsQuery.data ?? [];

  return (
    <div>
      <TopBar title="My vocabulary" onBack={onBack} />
      <Content>
        <div className="flex flex-wrap items-end gap-2">
          {personalDecks.length > 0 ? (
            <label className="flex min-w-[180px] flex-1 flex-col gap-1.5">
              <span className={VOCAB_LABEL}>Deck</span>
              <select
                value={deckId ?? ""}
                onChange={(e) => setSelectedId(Number(e.target.value))}
                className={VOCAB_INPUT}
              >
                {personalDecks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} · {d.card_count} {d.card_count === 1 ? "card" : "cards"}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newDeckName.trim()) createDeck.mutate(newDeckName.trim());
            }}
            className="flex items-end gap-2"
          >
            <label className="flex flex-col gap-1.5">
              <span className={VOCAB_LABEL}>New deck</span>
              <input
                value={newDeckName}
                onChange={(e) => setNewDeckName(e.target.value)}
                placeholder="e.g. Phrasal verbs"
                className={VOCAB_INPUT}
              />
            </label>
            <Button
              type="submit"
              variant="secondary"
              disabled={!newDeckName.trim() || createDeck.isPending}
              className="h-11"
            >
              {createDeck.isPending ? "Creating…" : "Create"}
            </Button>
          </form>
        </div>

        {deckId == null ? (
          <p className="rounded-md border border-dashed border-border bg-surface px-3.5 py-6 text-center font-body text-sm text-ink-soft">
            Create your first deck above to start adding words.
          </p>
        ) : (
          <>
            <AddCardForm deckId={deckId} />

            <div>
              <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                {cards.length} {cards.length === 1 ? "word" : "words"} in this deck
              </p>
              {cardsQuery.isPending ? (
                <p className="font-body text-sm text-ink-soft">Loading your words…</p>
              ) : cards.length === 0 ? (
                <p className="rounded-md border border-border bg-surface px-3.5 py-4 font-body text-sm text-ink-soft shadow-sm">
                  No words yet — add your first one above.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {cards.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-start gap-3 rounded-md border border-border bg-surface px-3.5 py-3 shadow-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="font-display text-[15px] font-semibold text-ink">
                            {c.term}
                          </span>
                          {c.ipa ? (
                            <span className="font-mono text-xs text-ink-faint">/{c.ipa}/</span>
                          ) : null}
                        </div>
                        <div className="font-body text-sm text-ink-soft">{c.meaning}</div>
                        {c.example_sentence ? (
                          <div className="mt-0.5 font-body text-[13px] italic text-ink-faint">
                            “{c.example_sentence}”
                          </div>
                        ) : null}
                      </div>
                      <button
                        onClick={() => removeCard.mutate(c.id)}
                        disabled={removeCard.isPending}
                        aria-label={`Delete ${c.term}`}
                        className="mt-0.5 border-0 bg-transparent p-0 text-ink-faint hover:text-correction disabled:opacity-40"
                      >
                        <Icon name="trash" size={17} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {removeCard.isError ? (
                <p role="alert" className="mt-2 font-body text-[13px] text-correction">
                  {(removeCard.error as Error).message}
                </p>
              ) : null}
            </div>
          </>
        )}
      </Content>
    </div>
  );
}

const NO_QUIZ: QuizStats = { correct: 0, total: 0, elapsedMs: 0 };

export function StudentApp() {
  const [screen, setScreen] = useState<Screen>("home");
  const [reviewed, setReviewed] = useState(0);
  const [quizStats, setQuizStats] = useState<QuizStats>(NO_QUIZ);

  return (
    // The page background already carries the ruled paper; just fill the height.
    <div className="flex flex-1 flex-col font-body text-ink">
      {screen === "home" ? (
        <Home onReview={() => setScreen("review")} onManageVocab={() => setScreen("vocab")} />
      ) : screen === "vocab" ? (
        <Vocab onBack={() => setScreen("home")} />
      ) : screen === "review" ? (
        <Review
          onFinish={(count) => {
            setReviewed(count);
            setScreen("quiz");
          }}
          onBack={() => setScreen("home")}
        />
      ) : screen === "quiz" ? (
        <Quiz
          onFinish={(stats) => {
            setQuizStats(stats);
            setScreen("done");
          }}
          onBack={() => setScreen("home")}
        />
      ) : (
        <Done
          reviewed={reviewed}
          quiz={quizStats}
          onHome={() => {
            setScreen("home");
            setReviewed(0);
            setQuizStats(NO_QUIZ);
          }}
        />
      )}
    </div>
  );
}
