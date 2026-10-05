# Alpha RPG Web Integration Audit

Branch: `web-integration-v1`  
Source branch audited: `neon-migration`

## Goal

Make WhatsApp and RPG Web two clients of the same game state and rules. The browser must not maintain its own copy of balances, pets, inventory, Raid/Boss state, cooldowns, progression, businesses or other game data.

## What already lives in Neon

### Core player state
- `users`: WhatsApp identity, level, EXP, premium/banned state.
- `wallets`: cash, bank and bank limit.
- `stats`: HP, max HP, ATK, DEF, SPD, equipped weapon/armor/boots, wins/losses.
- `items`: item catalog persisted at startup.
- `inventories`: player item quantities and item data.
- `equipment_upgrades`: equipment levels.
- `cooldowns`: shared cooldown state.
- `daily_streaks` and `level_reward_claims`.
- `transactions`: economy ledger.
- `profile_avatars`.

### Pets
- `pets`: current active pet mirror.
- `pet_collection`: full pet collection.
- `pet_team`: Principal / Suporte / Reserva.
- `pet_expeditions`.
- Pet HP/energy, wins/losses, XP and level are persisted.

### Player activities
- `player_sleep`.
- `player_carpinar`.
- relationships/proposals.
- market listings.
- group activity.

### Progression/economy
- daily missions.
- clans, members and invites.
- houses.
- cars.
- motorcycles/bikes.
- businesses and business levels.
- group missions/events.
- CLT Uber drivers and active shifts.

### Loans
- `player_loans` stores offers, accepted loans, deadlines and payments.

### Games / Boss / Raid sessions
- `trevo_games` persists JSON state by `chat_jid + game_type`.
- Raids, common/weekly/event Bosses and group minigames can therefore be read by the Web from the same session used by WhatsApp.

## What was still hardcoded

These are rules/catalogs in code rather than player-state records:

- Adoptable pet catalog and pet specialties.
- Legendary/Raid pet summon pools.
- Pet HP profiles, energy profiles and team-style mapping.
- Raid configurations and durations.
- Boss placement/drop configuration and scheduled event parameters.
- Equipment stat curves and potion definitions.
- Shop allow-list/menu categories.
- Houses, cars, motorcycles, Uber tiers, businesses and CLT Uber types.
- Daily mission pool.
- Loan rules.
- Event schedules and one-off event multipliers.

Hardcoded configuration is not itself a problem if there is only one authoritative module. The real problem found in the audit was duplication: for example, adoptable pet rules existed in both `index.js` and `db.js`, while Boss pet specialties existed again in `games.js`.

## Refactor started in this branch

### Shared pet catalog
`src/neon/game-catalog.js` now owns:
- the 26 adoptable pet definitions;
- pet prices and minimum levels;
- common + Raid/legendary pet specialties;
- helper conversion for combat percentages.

Consumers being moved to that shared source:
- WhatsApp menus in `index.js`;
- `adoptPet()` in `db.js`;
- Boss/Raid pet combat bonuses in `games.js`;
- Web API catalog.

This removes the exact class of bug where WhatsApp says one thing and the Web says another.

## Web authentication design

The browser must never receive `DATABASE_URL` or query Neon directly.

A player links Web to WhatsApp using:

1. Player sends `!web` in WhatsApp.
2. Bot creates an 8-character one-time code, valid for 10 minutes.
3. If `!web` was used inside a group, the code also binds that WhatsApp group.
4. Web exchanges the code for a random bearer token.
5. Only a SHA-256 hash of the code/token is persisted.
6. Web session expires after 30 days and can be revoked by logout.

New tables:
- `web_link_codes`
- `web_sessions`

Using `!web` inside the game group is important because Raid/Boss state is group-scoped in `trevo_games`.

## API foundation added

The existing Render HTTP process is reused; no additional Node dependency is required.

### Public
- `GET /api/v1/health`
- `GET /api/v1/catalog`

Catalog currently exposes:
- adoptable and Raid/legendary pets;
- specialties and HP profiles;
- Raid catalog;
- item/shop rows from Neon;
- houses;
- cars;
- bikes/motorcycles;
- businesses;
- CLT Uber types;
- loan rules.

### Authentication
- `POST /api/v1/auth/exchange`
- `POST /api/v1/auth/logout`

### Player bootstrap
- `GET /api/v1/me/bootstrap`

The bootstrap returns the same stored player state used by WhatsApp:
- profile and combat stats;
- inventory;
- pet collection and pet team;
- pet expeditions;
- daily missions and daily streak;
- career;
- house;
- garage;
- motorcycles;
- businesses;
- patrimony;
- CLT Uber state;
- loans;
- own market listings;
- achievements;
- relationship;
- linked group Raid/Boss snapshot when the session was paired from a group.

## What still needs to be exposed as actions

The current API foundation is intentionally read-first. The next implementation phases should call the existing service functions rather than reproduce their rules in the frontend.

### Player/economy
- daily claim
- work
- deposit / withdraw / transfer
- all/collection flows

### Items
- buy
- use
- sell
- equip
- upgrade
- boxes

### Pets
- adopt
- select
- rename
- set team
- rest/care
- expeditions
- summon Raid pet

### Raid/Boss
- create/join/start/cancel Raid
- Raid round/auto state
- start Boss
- Boss attack
- player/pet healing

### Vehicles/businesses
- buy/sell car and motorcycle
- Uber
- iFood
- CLT Uber
- business buy/collect/upgrade

### Market / loans / clans / missions
- market create/buy/cancel
- loan offer/accept/reject/pay
- clan actions
- mission claims and group mission actions

## Frontend migration rule

The standalone HTML prototype must stop persisting gameplay state as the source of truth.

Allowed local storage:
- bearer session token;
- UI preferences;
- selected visual character skin if it remains cosmetic;
- cache timestamps.

Not allowed as authoritative state:
- money/bank;
- HP/stats;
- levels/EXP;
- inventory;
- pets;
- pet team;
- Raid/Boss HP;
- cooldowns;
- businesses/vehicles;
- loans/market.

These must always be loaded from and mutated through the shared backend.
