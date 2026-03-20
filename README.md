# AppointWise Clone — AI Appointment Setter Bot

Een slimme AI-chatbot die leads kwalificeert via WhatsApp en afspraken inplant.
Gebouwd voor Bureau-Assist met Meta (Facebook/Instagram) advertentie-integratie.

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    COMPLETE LEAD FLOW                                │
│                                                                     │
│  ┌──────────────┐     ┌──────────────────┐     ┌────────────────┐  │
│  │  META ADS    │     │  META LEAD FORM  │     │  WEBHOOK       │  │
│  │  (Facebook/  │────>│  Lead vult in:   │────>│  /webhook/meta │  │
│  │  Instagram)  │     │  - Naam          │     │  Ontvangt data │  │
│  └──────────────┘     │  - Telefoon      │     └───────┬────────┘  │
│                       │  - Email         │             │            │
│                       │  - Bedrijf       │             ▼            │
│                       │  - Website       │     ┌────────────────┐  │
│                       └──────────────────┘     │  CONVERSATION  │  │
│                                                │  Store maakt   │  │
│                                                │  gesprek aan   │  │
│                                                │  met pre-filled│  │
│                                                │  lead data     │  │
│                                                └───────┬────────┘  │
│                                                        │            │
│                                                        ▼            │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    WHATSAPP GESPREK                           │   │
│  │                                                              │   │
│  │  Bot: "Hoi [naam]! Bedankt voor je interesse in              │   │
│  │        Bureau-Assist. Welke branche zit je in?"              │   │
│  │                                                              │   │
│  │  Lead: "Ik ben personal trainer"                             │   │
│  │                                                              │   │
│  │  Bot: "Top! Hoe doe je nu aan marketing om                   │   │
│  │        klanten te werven?"                                   │   │
│  │                                                              │   │
│  │  Lead: "Vooral mond-tot-mond en Instagram posts"             │   │
│  │                                                              │   │
│  │  Bot: "Hoeveel nieuwe klanten wil je per maand?"             │   │
│  │                                                              │   │
│  │  Lead: "10 per maand zou mooi zijn"                          │   │
│  │                                                              │   │
│  │  Bot: "Heb je eerder advertenties gedraaid op social media?" │   │
│  │                                                              │   │
│  │  Lead: "Nee, nog nooit"                                     │   │
│  │                                                              │   │
│  │  Bot: "Wat is je maandelijks marketing budget?"              │   │
│  │                                                              │   │
│  │  Lead: "Rond de 800 euro"                                   │   │
│  │                                                              │   │
│  └────────────────────────────────┬─────────────────────────────┘   │
│                               │                                     │
│                               ▼                                     │
│                    ┌─────────────────────┐                          │
│                    │  KWALIFICATIE CHECK │                          │
│                    │  Score: 0-100       │                          │
│                    └──────────┬──────────┘                          │
│                               │                                     │
│                    ┌──────────┴──────────┐                          │
│                    │                     │                          │
│                    ▼                     ▼                          │
│          ┌─────────────────┐  ┌──────────────────┐                 │
│          │  GEKWALIFICEERD │  │ NIET GEKWALIFIC.  │                 │
│          │                 │  │                    │                 │
│          │  Stuur booking  │  │  Vriendelijke      │                 │
│          │  link:          │  │  afwijzing met     │                 │
│          │  pocketlead.nl  │  │  uitleg waarom     │                 │
│          │  /boek/...      │  │                    │                 │
│          └─────────────────┘  └──────────────────┘                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Architectuur

```
src/
├── agent.ts           # AI-agent (Claude) - hart van de applicatie
│                        Verwerkt berichten, bouwt prompts, kwalificeert leads
├── conversation.ts    # Gespreksgeheugen - slaat alle gesprekken op
│                        Bevat MetaLeadData interface voor pre-filled data
├── meta-webhook.ts    # Meta webhook receiver - ontvangt leads van Facebook/IG
│                        Ondersteunt officieel Meta formaat + vereenvoudigd formaat
├── webhook.ts         # WhatsApp webhook - verwerkt inkomende WhatsApp berichten
├── server.ts          # Express webserver - routes en API endpoints
├── tenant.ts          # Multi-tenant systeem - meerdere klanten ondersteunen
├── config.ts          # Configuratie - laadt .env variabelen
├── seed.ts            # Seed script - maakt standaard tenant aan
├── cli.ts             # CLI interface - test de bot in je terminal
└── public/
    └── dashboard.html # Admin dashboard - beheer tenants en bekijk gesprekken
```

## Setup

```bash
# 1. Installeer alle afhankelijkheden (packages)
npm install

# 2. Maak een .env bestand aan (kopieer .env.example of maak handmatig)
# Vul in: ANTHROPIC_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, etc.

# 3. Maak de standaard tenant aan (Bureau-Assist)
npm run seed

# 4. Start de server
npm run dev
```

## Omgevingsvariabelen (.env)

```env
# Anthropic API-sleutel (voor Claude AI)
ANTHROPIC_API_KEY=sk-ant-...

# Bedrijfsinstellingen
BUSINESS_NAME=Bureau-Assist
BOOKING_URL=https://app.pocketlead.nl/boek/kennismakingsgesprek

# Twilio (voor WhatsApp)
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

# Server
PORT=3000
```

## API Endpoints

### Tenant Management (CRUD)
| Methode | Endpoint | Beschrijving |
|---------|----------|-------------|
| GET | `/api/tenants` | Alle tenants ophalen |
| POST | `/api/tenants` | Nieuwe tenant aanmaken |
| PUT | `/api/tenants/:id` | Tenant bijwerken |
| DELETE | `/api/tenants/:id` | Tenant verwijderen |

### Conversaties
| Methode | Endpoint | Beschrijving |
|---------|----------|-------------|
| GET | `/api/tenants/:id/conversations` | Gesprekken per tenant |
| GET | `/api/tenants/:id/stats` | Statistieken per tenant |
| GET | `/conversations` | Alle gesprekken (legacy) |
| GET | `/conversations/:id` | Specifiek gesprek ophalen |
| POST | `/conversations/:id/message` | Bericht sturen (test) |

### Webhooks
| Methode | Endpoint | Beschrijving |
|---------|----------|-------------|
| POST | `/webhook/whatsapp` | Twilio WhatsApp berichten |
| GET | `/webhook/meta` | Meta webhook verificatie |
| POST | `/webhook/meta` | Meta lead form data |

## Meta Webhook Instellen

### 1. Meta Developer Account
1. Ga naar [Meta for Developers](https://developers.facebook.com/)
2. Maak een nieuwe app aan (type: Business)
3. Voeg het product "Webhooks" toe

### 2. Webhook configureren
1. Ga naar Webhooks in je Meta app
2. Kies "Page" als object type
3. Vul de webhook URL in: `https://jouw-domein.nl/webhook/meta`
4. Vul de Verify Token in (= de `webhookSecret` van je tenant)
5. Abonneer op het veld "leadgen"

### 3. Lead Form aanmaken
1. Ga naar je Facebook Business pagina
2. Maak een advertentie met een Lead Form
3. Voeg de volgende velden toe:
   - Full Name (naam)
   - Phone Number (telefoon)
   - Email (email)
   - Company Name (bedrijf)
   - Website (website)

### 4. Testen met vereenvoudigd formaat
Je kunt ook direct leads aanmaken via de API:

```bash
curl -X POST http://localhost:3000/webhook/meta \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "bureau-assist",
    "naam": "Jan de Vries",
    "telefoon": "+31612345678",
    "email": "jan@bedrijf.nl",
    "bedrijf": "De Vries Coaching",
    "website": "https://devries-coaching.nl"
  }'
```

## CLI Testen

Test de bot zonder WhatsApp/Twilio:

```bash
npm run cli
```

Commando's:
- Type een bericht als lead
- `/info` — toon verzamelde lead-informatie
- `/quit` — stop het gesprek

## WhatsApp Integratie

1. Maak een Twilio-account aan op [twilio.com](https://www.twilio.com/)
2. Activeer de WhatsApp Sandbox
3. Vul de Twilio-gegevens in bij je tenant-configuratie
4. Stel de webhook URL in bij Twilio: `https://jouw-domein.nl/webhook/whatsapp`

## Dashboard

Ga naar `http://localhost:3000/` voor het admin dashboard:
- **Overzicht**: Statistieken en lead-overzicht per tenant
- **Gesprekken**: Bekijk alle gesprekken en berichtengeschiedenis
- **Klanten Beheer**: Beheer tenants (aanmaken, bewerken, verwijderen)

## Kwalificatiecriteria (Bureau-Assist)

De bot kwalificeert leads op basis van:
- **Branche**: coaching, consultancy, training, dienstverlening, fitness, gezondheid
- **Ambitie**: wil actief nieuwe klanten werven
- **Budget**: minimaal €500/maand voor marketing
- **Bereidheid**: openstaat voor samenwerking

## Kwalificatievragen

De bot kent al (vanuit Meta lead form):
1. Naam
2. Telefoon
3. Email
4. Bedrijfsnaam
5. Website

De bot vraagt EXTRA (via WhatsApp):
1. "Welke branche zit je in?"
2. "Hoe doe je nu aan marketing om klanten te werven?"
3. "Hoeveel nieuwe klanten wil je per maand?"
4. "Heb je eerder advertenties gedraaid op social media?"
5. "Wat is je maandelijks marketing budget?"

## Scripts

```bash
npm run dev    # Start ontwikkelserver (met ts-node)
npm run cli    # Test de bot in de terminal
npm run build  # Compileer TypeScript naar JavaScript
npm run seed   # Maak standaard tenant aan
npm start      # Start gecompileerde versie
```

## Technologie Stack

- **TypeScript** — Type-veilige JavaScript
- **Express.js** — Webserver framework
- **Anthropic Claude** — AI voor gesprekken en kwalificatie
- **Twilio** — WhatsApp berichten verzenden/ontvangen
- **Meta Webhooks** — Lead formulier data ontvangen van Facebook/Instagram

## Volgende Stappen

- [ ] PocketLead CRM integratie (leads automatisch opslaan)
- [ ] Database (PostgreSQL) in plaats van in-memory opslag
- [ ] Automatische follow-up berichten bij geen reactie
- [ ] Meta webhook signature verificatie (HMAC-SHA256)
- [ ] Rate limiting en abuse protection
- [ ] Lead scoring verbeteren met historische data
