"""Ulazna točka za Vercel (Python serverless funkcija).

Lokalno se koristi `uvicorn api.main:app`; Vercel ovdje traži objekt `app`.
React (frontend/dist) Vercel poslužuje sam kao statične datoteke.
"""
from api.main import app  # noqa: F401
