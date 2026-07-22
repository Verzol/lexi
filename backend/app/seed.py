"""
Seed the database with the teacher account, one demo student, and a starter
deck. Idempotent — safe to re-run.

    uv run python -m app.seed
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.security import hash_password
from app.config import get_settings
from app.db import SessionLocal
from app.models import Assignment, Card, CardSource, Deck, Language, Streak, User, UserRole

settings = get_settings()

STARTER_CARDS = [
    ("meticulous", "showing great attention to detail; very careful and precise",
     "məˈtɪkjələs", "She kept meticulous notes for every mock exam."),
    ("resilient", "able to recover quickly from difficulties",
     "rɪˈzɪliənt", "Strong students are resilient after a low score."),
    ("inevitable", "certain to happen; unavoidable",
     "ɪnˈevɪtəbl", "With daily review, progress feels inevitable."),
    ("ambitious", "having a strong desire to succeed or achieve something",
     "æmˈbɪʃəs", "She's ambitious about passing the entrance exam this year."),
    ("pragmatic", "dealing with things sensibly and realistically",
     "præɡˈmætɪk", "Take a pragmatic approach: review a little every day."),
    ("diligent", "showing care and persistent effort in your work",
     "ˈdɪlɪdʒənt", "Diligent revision beats last-minute cramming."),
]


def get_or_create_language(db: Session) -> Language:
    lang = db.scalar(select(Language).where(Language.code == "en"))
    if lang is None:
        lang = Language(code="en", name="English")
        db.add(lang)
        db.flush()
    return lang


def get_or_create_user(db: Session, email: str, **kwargs) -> User:
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(email=email, **kwargs)
        db.add(user)
        db.flush()
        if user.role is UserRole.student:
            db.add(Streak(student_id=user.id))
    return user


def main() -> None:
    db = SessionLocal()
    try:
        lang = get_or_create_language(db)

        admin = get_or_create_user(
            db,
            settings.seed_admin_email.lower(),
            password_hash=hash_password(settings.seed_admin_password),
            display_name="Verzol",
            role=UserRole.admin,
            email_verified=True,
        )
        student = get_or_create_user(
            db,
            "mai@lexi.app",
            password_hash=hash_password("changeme"),
            display_name="Mai Nguyen",
            role=UserRole.student,
            email_verified=True,
        )

        deck = db.scalar(select(Deck).where(Deck.name == "Entrance Exam — Core 300"))
        if deck is None:
            deck = Deck(
                owner_id=admin.id,
                language_id=lang.id,
                name="Entrance Exam — Core 300",
                description="Core vocabulary for the grade-10 entrance exam.",
                exam_tag="grade-10-entrance",
                topic_tags=["academic-adjectives"],
            )
            db.add(deck)
            db.flush()

        if not db.scalars(select(Card).where(Card.deck_id == deck.id)).first():
            db.add_all(
                Card(
                    deck_id=deck.id,
                    term=term,
                    meaning=meaning,
                    ipa=ipa,
                    example_sentence=example,
                    source=CardSource.manual,
                )
                for term, meaning, ipa, example in STARTER_CARDS
            )

        assignment = db.scalar(
            select(Assignment).where(
                Assignment.student_id == student.id, Assignment.deck_id == deck.id
            )
        )
        if assignment is None:
            db.add(Assignment(student_id=student.id, deck_id=deck.id))

        db.commit()
        print(f"Seeded. Teacher: {admin.email} | Student: {student.email} | Deck: {deck.name!r}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
