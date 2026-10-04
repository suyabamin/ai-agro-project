# AgroAI Project Skill

## Project Identity

Project name: AgroAI

AgroAI is an agriculture field-management and AI decision-support web application.

The system helps farmers monitor field conditions and provides:

- Field status
- Water need
- Recommended action
- Disease/pathogen analysis through the existing `su0.1` AI

IMPORTANT:
This is NOT a crop recommendation system.

---

# 1. NON-NEGOTIABLE PROJECT RULE

This is an existing project.

DO NOT break existing functionality.

Before making any change:

1. Read the entire relevant project structure.
2. Read existing documentation.
3. Read existing API/service implementations.
4. Read the existing frontend components.
5. Understand existing data flow.
6. Reuse existing functionality whenever possible.

Never rewrite working functionality unnecessarily.

---

# 2. PRESERVE EXISTING FEATURES

The following must remain working:

- Existing Dashboard
- Existing navigation
- Existing pages
- Existing authentication
- Existing Firebase functionality
- Existing database functionality
- Existing field management
- Existing weather functionality
- Existing Google/search fetcher
- Existing disease/pathogen fetchers
- Existing AI functionality
- Existing `su0.1` model
- Existing history
- Existing APIs
- Existing frontend services
- Existing backend services
- Existing styling
- Existing responsive design
- Existing environment variables
- Existing deployment configuration

DO NOT remove existing features.

DO NOT replace working features.

---

# 3. FETCHER PROTECTION

IMPORTANT:

DO NOT change existing fetchers unless the user explicitly requests it.

Especially preserve:

- Google/search fetcher
- Weather fetcher
- Disease information fetcher
- Pathogen information fetcher
- Existing external API integrations

Do not:

- rewrite them
- replace them
- remove them
- change their response structure
- change their timeout behavior unnecessarily
- change their API contracts

New functionality must coexist with the existing fetchers.

---

# 4. EXISTING DISEASE AI

The existing disease AI is:

`su0.1`

It is already part of the project.

DO NOT:

- replace `su0.1`
- retrain `su0.1`
- rename `su0.1`
- change its model file
- change its preprocessing
- change its prediction logic

When the new decision system determines that:

`ACTION = Pathogen AI`

use the existing `su0.1` system.

Do not create a fake replacement pathogen model.

---

# 5. DECISION INTELLIGENCE SYSTEM

The Decision Intelligence system predicts:

## STATUS

Possible values:

- Healthy
- Attention
- Critical

## WATER NEED

Possible values:

- Low
- Moderate
- High
- Urgent

## ACTION

Action is NOT a machine-learning target.

Action is determined by a transparent policy using:

`Status + Water Need`

Examples:

```text
Critical + Urgent
→ Pathogen AI

Critical + High
→ Pathogen AI

Attention + Low
→ Inspect

Healthy + Moderate
→ Inspect