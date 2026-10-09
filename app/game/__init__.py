"""Game rules: XP, levels and ranks (and, later, streaks and badges).

The rules are pure functions, unit-tested without a database. The only
persistence here is the XP ledger in xp.py, and every query in it is scoped
to the user passed in.
"""
