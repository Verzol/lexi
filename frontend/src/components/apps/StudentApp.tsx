"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Flashcard } from "@/components/ui/Flashcard";
import { GradeButtons } from "@/components/ui/GradeButtons";
import { Icon } from "@/components/ui/Icon";
import { StatTile } from "@/components/ui/StatTile";
import { SignOutButton } from "@/components/ui/SignOutButton";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { api, decks as decksApi } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";

/**
 * StudentApp — the phone-first daily loop from SoW §3: open app → Review Today
 * (due cards, grade) → short quiz → streak ticks up. Built entirely around the
 * signature Flashcard.
 *
 * M1: Home reads real decks / due counts / streak from the API.
 * The Review and Quiz screens below still run on fixture data — they get wired
 * to the FSRS scheduler in M2 (`/review/due` + `/review/grade`).
 */

const DUE = [
  {
    term: "meticulous",
    ipa: "məˈtɪkjələs",
    meaning: "showing great attention to detail; very careful and precise",
    example: "She kept meticulous notes for every mock exam.",
  },
  {
    term: "resilient",
    ipa: "rɪˈzɪliənt",
    meaning: "able to recover quickly from difficulties",
    example: "Strong students are resilient after a low score.",
  },
  {
    term: "inevitable",
    ipa: "ɪnˈevɪtəbl",
    meaning: "certain to happen; unavoidable",
    example: "With daily review, progress feels inevitable.",
  },
];

const QUIZ = {
  prompt: "ambitious",
  ipa: "æmˈbɪʃəs",
  q: "Which meaning matches this word?",
  options: [
    "having a strong desire to succeed or achieve something",
    "easily upset or offended by small things",
    "lasting for a very short time",
    "unwilling to change one's mind",
  ],
  answer: 0,
};

type Streak = { current_streak: number; longest_streak: number; freezes_remaining: number };

type Screen = "home" | "review" | "quiz" | "done";

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

function Home({ onReview }: { onReview: () => void }) {
  const { user } = useAuth();

  const decksQuery = useQuery({ queryKey: ["decks"], queryFn: decksApi.listMine });
  const streakQuery = useQuery({
    queryKey: ["streak"],
    queryFn: () => api<Streak>("/me/streak"),
  });

  const myDecks = decksQuery.data ?? [];
  const totalDue = myDecks.reduce((sum, d) => sum + d.due_count, 0);
  const totalCards = myDecks.reduce((sum, d) => sum + d.card_count, 0);
  const streak = streakQuery.data?.current_streak ?? 0;
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
            hint={streak === 1 ? "day" : "days"}
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
            Assigned to you
          </p>

          {!decksQuery.isPending && myDecks.length === 0 ? (
            <div className="rounded-md border border-border bg-surface px-3.5 py-4 font-body text-sm text-ink-soft shadow-sm">
              No decks yet. Your teacher will assign one after your next lesson.
            </div>
          ) : (
            // One column on a phone; two side by side once there is room.
            <div className="grid gap-2 sm:grid-cols-2">
              {myDecks.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center gap-3 rounded-md border border-border bg-surface px-3.5 py-3 shadow-sm"
                >
                  <span className="text-ink-faint">
                    <Icon name="layers" size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-sm font-semibold text-ink">
                      {d.name}
                    </div>
                    <div className="mt-0.5 font-mono text-[10.5px] uppercase tracking-wider text-ink-faint">
                      {d.exam_tag ?? `${d.card_count} cards`}
                    </div>
                  </div>
                  <Badge tone={d.due_count ? "correction" : "check"}>
                    {d.due_count ? `${d.due_count} due` : "done"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </Content>
    </div>
  );
}

function Review({
  idx,
  revealed,
  onReveal,
  onGrade,
  onBack,
}: {
  idx: number;
  revealed: boolean;
  onReveal: () => void;
  onGrade: () => void;
  onBack: () => void;
}) {
  const card = DUE[idx];
  const total = DUE.length;
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
              onClick={onReveal}
              className="w-full cursor-pointer text-left"
              aria-label={`Reveal the meaning of ${card.term}`}
            >
              <Flashcard
                tag={<Badge tone="correction">due now</Badge>}
                term={card.term}
                ipa={card.ipa}
                meaning="Tap to reveal the meaning"
              />
            </button>
          ) : (
            <Flashcard
              tag={<Badge tone="pen">grade-10-entrance</Badge>}
              term={card.term}
              ipa={card.ipa}
              meaning={card.meaning}
              example={card.example}
              footer={
                <div>
                  <p className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-faint">
                    How well did you know it?
                  </p>
                  <GradeButtons onGrade={onGrade} />
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

function Quiz({ pick, onPick, onFinish, onBack }: { pick: number | null; onPick: (i: number) => void; onFinish: () => void; onBack: () => void }) {
  const correct = pick === QUIZ.answer;
  return (
    <div>
      <TopBar
        title="Quick quiz"
        onBack={onBack}
        right={
          <span className="flex items-center gap-1 font-mono text-xs text-ink-faint">
            <Icon name="clock" size={15} />
            0:45
          </span>
        }
      />
      <Content>
        <div className="mx-auto w-full max-w-xl">
          <div>
            <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-pen">
              {QUIZ.q}
            </p>
            <h2 className="mt-2 mb-0.5 font-display text-3xl font-extrabold tracking-tight text-ink">
              {QUIZ.prompt}
            </h2>
            <span className="font-mono text-sm text-ink-faint">/{QUIZ.ipa}/</span>
          </div>

          <div className="mt-4 flex flex-col gap-2.5">
            {QUIZ.options.map((o, i) => {
              const chosen = pick === i;
              const showRight = pick != null && i === QUIZ.answer;
              const showWrong = chosen && i !== QUIZ.answer;
              const toneClass = showRight
                ? "border-check bg-check-soft text-check"
                : showWrong
                  ? "border-correction bg-correction-soft text-correction"
                  : "border-border bg-surface text-ink hover:border-pen";
              return (
                <button
                  key={i}
                  disabled={pick != null}
                  onClick={() => onPick(i)}
                  className={`flex items-center gap-2.5 rounded-md border-[1.5px] px-4 py-3.5 text-left font-body text-[15px] shadow-sm transition-colors ${
                    pick == null ? "cursor-pointer" : "cursor-default"
                  } ${toneClass}`}
                >
                  <span className="flex-1">{o}</span>
                  {showRight ? <Icon name="check" size={18} /> : null}
                  {showWrong ? <Icon name="x" size={18} /> : null}
                </button>
              );
            })}
          </div>

          {pick != null ? (
            <Button variant="primary" onClick={onFinish} className="mt-4 h-12 w-full">
              {correct ? "Nice — finish session" : "Got it, finish session"}
            </Button>
          ) : null}
        </div>
      </Content>
    </div>
  );
}

function Done({ onHome }: { onHome: () => void }) {
  return (
    <div className="flex min-h-full flex-col">
      <TopBar />
      <div className="flex flex-1 flex-col items-center justify-center gap-[18px] px-4 py-12 text-center sm:py-16">
        <div className="flex h-[84px] w-[84px] items-center justify-center rounded-full bg-check-soft text-check">
          <Icon name="flame" size={44} fill="var(--check-soft)" />
        </div>
        <div>
          <h1 className="m-0 font-display text-[28px] font-extrabold tracking-tight text-ink">
            15-day streak
          </h1>
          <p className="mt-1.5 font-body text-base text-ink-soft">
            Done for today — all 3 cards reviewed. See you tomorrow.
          </p>
        </div>
        <div className="grid w-full max-w-sm grid-cols-3 gap-2.5">
          <StatTile label="Reviewed" value="3" hint="cards" tone="check" />
          <StatTile label="Quiz" value="1/1" hint="correct" tone="check" />
          <StatTile label="Time" value="1:52" hint="today" />
        </div>
        <Button variant="secondary" onClick={onHome} className="mt-1">
          Back to home
        </Button>
      </div>
    </div>
  );
}

export function StudentApp() {
  const [screen, setScreen] = useState<Screen>("home");
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [pick, setPick] = useState<number | null>(null);
  const total = DUE.length;

  function grade() {
    if (idx + 1 < total) {
      setIdx(idx + 1);
      setRevealed(false);
    } else {
      setRevealed(false);
      setScreen("quiz");
    }
  }

  return (
    // The page background already carries the ruled paper; just fill the height.
    <div className="flex flex-1 flex-col font-body text-ink">
      {screen === "home" ? (
        <Home
          onReview={() => {
            setScreen("review");
            setIdx(0);
            setRevealed(false);
          }}
        />
      ) : screen === "review" ? (
        <Review
          idx={idx}
          revealed={revealed}
          onReveal={() => setRevealed(true)}
          onGrade={grade}
          onBack={() => setScreen("home")}
        />
      ) : screen === "quiz" ? (
        <Quiz pick={pick} onPick={setPick} onFinish={() => setScreen("done")} onBack={() => setScreen("home")} />
      ) : (
        <Done
          onHome={() => {
            setScreen("home");
            setPick(null);
            setIdx(0);
          }}
        />
      )}
    </div>
  );
}
