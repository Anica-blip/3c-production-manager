# 3c-production-manager

⚖️ This repository is protected under a binding Legal Disclaimer that governs all use, cloning, and forking from the date of inception. Please read before use.

The personal task and production pipeline tracker for the 3C Thread To Success™ ecosystem. Where every piece of content — from first idea to published, archived, and filed — gets tracked by platform, by week, stage by stage, so production stays production and creative stays creative.

⚠️ Intellectual Property Notice
This repository is open source under the MIT License — the code skeleton is free to clone and adapt. The 3C Thread To Success™ brand, including its name, structure, and overall ecosystem identity, remains the intellectual property of the creator and is not included in this license. Commercial use of the brand or replication of the ecosystem identity is not permitted without permission.

This project is part of the 3C Thread To Success™ ecosystem — a growing digital platform that combines creativity, structure, and real-world application.

---

## What it is

A private task and production pipeline tracker, organised by week and by platform. It keeps production separate from creative work, so the whole pipeline never has to be held in one's head at once.

## Inside

**Tasks** — a weekly sticky-note diary. Each entry carries a date and time and its own tickable checklist, and sits on a mini calendar for the week. The Index gives a quick jump straight to any note.

**Pipeline** — a separate weekly board for each platform, moving through five stages: Create, Review, Schedule, Publish, Archive.

- Each task carries its own custom checklist. Ticking a step named after a stage (e.g. "Schedule") moves the task there automatically.
- Schedule has two sub-steps of its own: *Add to platform* and *Add to record center*.
- Archive is confirmed once the corresponding `.md` file has been filed to COG.
- **View / export** shows published items as a table, with a CSV download.
- New platforms can be added at any time, each with its own starting checklist.

## Tech stack

- Front end hosted on GitHub Pages
- Cloudflare Worker at `productionmanager.threadcommand.center`
- Cloudflare D1 for storage
- GitHub OAuth, restricted to Chef's own account
- Session held as a signed token in `localStorage`, not a cookie

## Connected systems

Links to the Record Centre by hand only — nothing here ever touches its code or its database.

---

## 🎨 Credits
*Designed and Built with ❤️ by Claude (Anthropic) × Chef Anica · 3C Thread To Success™ Cooking Lab* 🧪👨‍🍳
"Think Smarter, Not Harder - Zero Shortcuts"

---

## 👤 Creator
Anica-blip ("Chef")
Founder of 3C Thread To Success™ ("Cooking Lab")
Independent Creator | Community Builder

---

## 🧠 Philosophy
"Think it. Do it. Own it."

This project was built from vision, persistence, and a commitment to creating meaningful and structured experiences — even with minimal resources.
