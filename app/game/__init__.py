"""Game rules: XP, levels and ranks, streaks, and badges.

The rules are pure functions, unit-tested without a database. The persistence
is the three ledgers (xp.py, streaks.py, badges.py), and every query in them is
scoped to the user passed in.
"""
