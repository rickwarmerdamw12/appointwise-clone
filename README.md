# Bureau-Assist AI Appointment Setter

AI-powered appointment setter die leads kwalificeert via conversatie en afspraken inplant.

## Stack
- TypeScript + Node.js
- Claude API (Anthropic) voor conversatie
- Express.js HTTP server + API
- Twilio WhatsApp Business integratie
- Koppelt aan PocketLead booking systeem

## Setup

```bash
npm install
```

Kopieer `.env` en vul je keys in:
```
ANTHROPIC_API_KEY=sk-ant-...          # Haal op via console.anthropic.com
BUSINESS_NAME=Bureau-Assist
BOOKING_URL=https://app.pocketlead.nl/boek/kennismakingsgesprek

# Twilio (voor WhatsApp)
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

# Server
PORT=3000
```

> **Let op:** Rick moet een Anthropic API key aanmaken via [console.anthropic.com](https://console.anthropic.com).

## Scripts

```bash
# Start de HTTP server (met API + WhatsApp webhook + dashboard)
npm run dev

# Test via CLI in de terminal
npm run cli

# Bouw voor productie
npm run build

# Start productie build
npm start
```

## API Endpoints

### WhatsApp Webhook
- `POST /webhook/whatsapp` - Ontvang inkomende WhatsApp berichten van Twilio

### Conversaties API
- `GET /conversations` - Lijst van alle conversaties
- `GET /conversations/:id` - Specifieke conversatie ophalen
- `POST /conversations/:id/message` - Handmatig een bericht sturen

### Dashboard
- `GET /dashboard` - Live dashboard met overzicht van alle leads en scores

## CLI Testen

```bash
npm run cli
```

Dit simuleert een gesprek met een lead in de terminal. De AI agent:
1. Stelt zich voor
2. Stelt kwalificatievragen (een per keer)
3. Bepaalt of de lead geschikt is
4. Stuurt een boekingslink als de lead gekwalificeerd is

Commands in CLI:
- `/info` - Toon verzamelde lead informatie
- `/quit` - Stop het gesprek

## WhatsApp Integratie

1. Maak een Twilio account aan op [twilio.com](https://www.twilio.com)
2. Activeer de WhatsApp Sandbox in Twilio Console
3. Stel de webhook URL in op `https://jouw-domein.nl/webhook/whatsapp`
4. Vul de Twilio credentials in `.env`

## Dashboard

Open `http://localhost:3000/dashboard` na het starten van de server. Het dashboard toont:
- Totaal aantal gesprekken
- Actieve, gekwalificeerde en geplande afspraken
- Per lead: naam, bedrijf, branche, budget, score en status
- Klik op een conversatie om het volledige gesprek te bekijken
- Auto-refresh elke 10 seconden

## Architectuur

```
src/
  config.ts        - Configuratie en env variabelen
  conversation.ts  - Conversation memory store
  agent.ts         - Claude AI agent voor kwalificatie
  webhook.ts       - WhatsApp webhook handler (Twilio)
  server.ts        - Express HTTP server met API endpoints
  dashboard.html   - Live dashboard pagina
  cli.ts           - Terminal test interface
```

## Volgende stappen
- [ ] Koppeling met PocketLead CRM (automatisch contact aanmaken)
- [ ] Follow-up berichten als lead niet reageert
- [ ] Persistente opslag (database ipv in-memory)
- [ ] Webhook validatie met Twilio signature
- [ ] Multi-agent support (meerdere bedrijven)
