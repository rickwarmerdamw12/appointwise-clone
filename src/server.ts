/**
 * HTTP API Server (Webserver)
 *
 * Dit is het "zenuwcentrum" van de applicatie. De server:
 * 1. Ontvangt HTTP-verzoeken (van het dashboard, de API, of Twilio)
 * 2. Routeert ze naar de juiste handler
 * 3. Stuurt een antwoord terug
 *
 * WAT IS EXPRESS?
 * Express is het populairste webframework voor Node.js.
 * Het maakt het makkelijk om een webserver te bouwen die HTTP-verzoeken
 * kan ontvangen en beantwoorden.
 *
 * WAT IS EEN API?
 * API = Application Programming Interface.
 * Het is een set "afspraken" over hoe programma's met elkaar praten.
 * Onze API gebruikt JSON (JavaScript Object Notation) om data te sturen.
 *
 * MULTI-TENANT ENDPOINTS:
 * Alle tenant-gerelateerde endpoints beginnen met /api/tenants.
 * CRUD = Create (aanmaken), Read (lezen), Update (bijwerken), Delete (verwijderen)
 */

import express from "express"; // Het Express webframework
import path from "path"; // Node.js module voor bestandspaden
import { config } from "./config"; // Onze configuratie (poort, etc.)
import webhookRouter from "./webhook"; // De WhatsApp webhook handler
import {
  handleMessage,
  startConversation,
  getConversation,
  getAllConversations,
  getConversationsByTenant,
  tenantStore,
} from "./agent"; // Agent-functies en data-stores

/**
 * Maak de Express-applicatie aan.
 * 'app' is het hoofdobject waarmee we routes, middleware, en instellingen beheren.
 */
const app = express();

// === MIDDLEWARE ===
// Middleware zijn functies die ELKE request verwerken VOORDAT ze bij een route komen.

/**
 * express.json() — Parse JSON-data uit de request body.
 * Als iemand JSON stuurt (bijv. {"name": "test"}), zet deze middleware
 * het om naar een JavaScript-object dat beschikbaar is via req.body.
 */
app.use(express.json());

/**
 * express.urlencoded() — Parse formulier-data uit de request body.
 * Dit wordt gebruikt door Twilio (die stuurt data als formulier, niet als JSON).
 * 'extended: true' staat complexere data-structuren toe.
 */
app.use(express.urlencoded({ extended: true }));

// === STATISCHE BESTANDEN ===
/**
 * Serveer het dashboard als statisch bestand.
 * express.static() vertelt Express: "als iemand een bestand vraagt,
 * zoek het in deze map en stuur het terug."
 */
app.use(express.static(path.join(__dirname, "public")));

// === WHATSAPP WEBHOOK ===
/**
 * Mount de webhook-router op /webhook.
 * Dit betekent: alle routes in webhookRouter worden voorafgegaan door /webhook.
 * Dus de route POST /whatsapp in de router wordt POST /webhook/whatsapp.
 */
app.use("/webhook", webhookRouter);

// ============================================
// === TENANT API ENDPOINTS (CRUD) ===
// ============================================

/**
 * GET /api/tenants
 * Haal ALLE tenants op.
 *
 * Dit endpoint wordt gebruikt door het dashboard om een overzicht te tonen
 * van alle klanten die het systeem gebruiken.
 *
 * Let op: We sturen de volledige tenant-objecten terug, inclusief API-sleutels.
 * In een productie-app zou je gevoelige velden willen verbergen!
 */
app.get("/api/tenants", (_req, res) => {
  const tenants = tenantStore.getAll();
  res.json(tenants); // Stuur de array als JSON terug
});

/**
 * POST /api/tenants
 * Maak een NIEUWE tenant aan.
 *
 * De client (het dashboard) stuurt een JSON-object met alle tenant-gegevens.
 * We controleren of de verplichte velden aanwezig zijn en maken de tenant aan.
 *
 * HTTP Status Codes:
 * - 201 Created: succesvol aangemaakt
 * - 400 Bad Request: verplichte velden ontbreken
 * - 409 Conflict: er bestaat al een tenant met dit ID
 */
app.post("/api/tenants", (req, res) => {
  const data = req.body;

  // Controleer of de verplichte velden aanwezig zijn
  if (!data.id || !data.businessName || !data.agentName) {
    res.status(400).json({
      error: "Verplichte velden: id, businessName, agentName",
    });
    return;
  }

  // Controleer of er al een tenant bestaat met dit ID
  if (tenantStore.get(data.id)) {
    res.status(409).json({ error: "Tenant met dit ID bestaat al" });
    return;
  }

  // Maak de tenant aan met standaardwaarden voor ontbrekende velden
  const tenant = tenantStore.create({
    id: data.id,
    businessName: data.businessName,
    agentName: data.agentName,
    agentTone: data.agentTone || "Vriendelijk en professioneel",
    qualificationQuestions: data.qualificationQuestions || [],
    minBudget: data.minBudget || 500,
    idealIndustries: data.idealIndustries || [],
    bookingUrl: data.bookingUrl || "",
    anthropicApiKey: data.anthropicApiKey || "",
    twilioAccountSid: data.twilioAccountSid || "",
    twilioAuthToken: data.twilioAuthToken || "",
    twilioPhoneNumber: data.twilioPhoneNumber || "",
    webhookSecret: data.webhookSecret || "",
  });

  // Status 201 = "Created" (iets nieuws is succesvol aangemaakt)
  res.status(201).json(tenant);
});

/**
 * PUT /api/tenants/:id
 * Werk een bestaande tenant bij.
 *
 * :id is een "route parameter" — het wordt automatisch vervangen door
 * de waarde in de URL. Bijv. PUT /api/tenants/bureau-assist
 * dan is req.params.id === "bureau-assist".
 *
 * De client stuurt alleen de velden die gewijzigd moeten worden.
 */
app.put("/api/tenants/:id", (req, res) => {
  const updated = tenantStore.update(req.params.id, req.body);

  if (!updated) {
    // Tenant niet gevonden — stuur een 404 (Not Found) terug
    res.status(404).json({ error: "Tenant niet gevonden" });
    return;
  }

  res.json(updated); // Stuur de bijgewerkte tenant terug
});

/**
 * DELETE /api/tenants/:id
 * Verwijder een tenant.
 *
 * LET OP: Dit verwijdert de tenant PERMANENT.
 * In een productie-app zou je misschien een "soft delete" willen doen
 * (markeren als verwijderd, maar niet echt weggooien).
 */
app.delete("/api/tenants/:id", (req, res) => {
  const deleted = tenantStore.delete(req.params.id);

  if (!deleted) {
    res.status(404).json({ error: "Tenant niet gevonden" });
    return;
  }

  // Status 204 = "No Content" (succesvol verwijderd, geen data om terug te sturen)
  res.status(204).send();
});

// ============================================
// === TENANT CONVERSATIE ENDPOINTS ===
// ============================================

/**
 * GET /api/tenants/:id/conversations
 * Haal alle gesprekken op van een specifieke tenant.
 *
 * Dit is het hart van het multi-tenant systeem:
 * elke tenant ziet alleen ZIJN EIGEN gesprekken.
 */
app.get("/api/tenants/:id/conversations", (req, res) => {
  // Controleer of de tenant bestaat
  const tenant = tenantStore.get(req.params.id);
  if (!tenant) {
    res.status(404).json({ error: "Tenant niet gevonden" });
    return;
  }

  // Haal alleen de gesprekken op die bij deze tenant horen
  const conversations = getConversationsByTenant(req.params.id);
  res.json(conversations);
});

/**
 * GET /api/tenants/:id/stats
 * Haal statistieken op voor een specifieke tenant.
 *
 * Dit endpoint berekent een samenvatting van alle gesprekken:
 * hoeveel leads, hoeveel gekwalificeerd, hoeveel afspraken, etc.
 *
 * Het dashboard gebruikt dit om de statistieken-kaarten te vullen.
 */
app.get("/api/tenants/:id/stats", (req, res) => {
  const tenant = tenantStore.get(req.params.id);
  if (!tenant) {
    res.status(404).json({ error: "Tenant niet gevonden" });
    return;
  }

  // Haal alle gesprekken van deze tenant op
  const conversations = getConversationsByTenant(req.params.id);

  // Bereken de statistieken door te tellen hoeveel gesprekken elke status hebben
  const stats = {
    totaal: conversations.length,
    actief: conversations.filter((c) => c.status === "actief").length,
    gekwalificeerd: conversations.filter((c) => c.status === "gekwalificeerd").length,
    niet_gekwalificeerd: conversations.filter((c) => c.status === "niet_gekwalificeerd").length,
    afspraak_gepland: conversations.filter((c) => c.status === "afspraak_gepland").length,
    // Bereken de gemiddelde score (alleen van gesprekken met een score > 0)
    gemiddeldeScore: conversations.length > 0
      ? Math.round(
          conversations.reduce((sum, c) => sum + c.score, 0) / conversations.length
        )
      : 0,
      // reduce() loopt door alle gesprekken en telt de scores op
      // Daarna delen we door het aantal gesprekken voor het gemiddelde
  };

  res.json(stats);
});

// ============================================
// === LEGACY CONVERSATIE ENDPOINTS ===
// ============================================
// Deze endpoints bestonden al in de vorige versie.
// We houden ze voor achterwaartse compatibiliteit.

/**
 * GET /conversations
 * Lijst van ALLE conversaties (van alle tenants).
 */
app.get("/conversations", (_req, res) => {
  const conversations = getAllConversations();
  res.json(conversations);
});

/**
 * GET /conversations/:id
 * Haal een specifiek gesprek op via zijn ID.
 */
app.get("/conversations/:id", (req, res) => {
  const conv = getConversation(req.params.id);
  if (!conv) {
    res.status(404).json({ error: "Conversatie niet gevonden" });
    return;
  }
  res.json(conv);
});

/**
 * POST /conversations/:id/message
 * Stuur handmatig een bericht in een conversatie (voor testen via de API).
 *
 * Je moet een tenantId meesturen zodat we weten welke tenant-configuratie
 * we moeten gebruiken voor het AI-antwoord.
 */
app.post("/conversations/:id/message", async (req, res) => {
  const { message, tenantId } = req.body;

  // Controleer of het bericht is meegegeven
  if (!message) {
    res.status(400).json({ error: "Veld 'message' is verplicht" });
    return;
  }

  // We hebben een tenantId nodig om te weten welke AI-instellingen te gebruiken
  if (!tenantId) {
    res.status(400).json({ error: "Veld 'tenantId' is verplicht" });
    return;
  }

  try {
    // Start het gesprek als het nog niet bestaat
    const existing = getConversation(req.params.id);
    if (!existing) {
      await startConversation(tenantId, req.params.id);
    }

    // Verwerk het bericht via de AI-agent
    const reply = await handleMessage(tenantId, req.params.id, message);
    const conv = getConversation(req.params.id);

    // Stuur het antwoord en de bijgewerkte conversatie terug
    res.json({ reply, conversation: conv });
  } catch (error) {
    console.error("[API] Fout bij verwerken van bericht:", error);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// === START DE SERVER ===
/**
 * app.listen() start de webserver op de geconfigureerde poort.
 * De callback-functie wordt aangeroepen zodra de server klaar is.
 */
app.listen(config.port, () => {
  console.log(`\n🚀 Bureau-Assist API draait op http://localhost:${config.port}`);
  console.log(`📊 Dashboard: http://localhost:${config.port}/`);
  console.log(`📱 WhatsApp Webhook: http://localhost:${config.port}/webhook/whatsapp`);
  console.log(`\nAPI endpoints:`);
  console.log(`  GET    /api/tenants                    - Alle tenants ophalen`);
  console.log(`  POST   /api/tenants                    - Nieuwe tenant aanmaken`);
  console.log(`  PUT    /api/tenants/:id                - Tenant bijwerken`);
  console.log(`  DELETE /api/tenants/:id                - Tenant verwijderen`);
  console.log(`  GET    /api/tenants/:id/conversations  - Gesprekken per tenant`);
  console.log(`  GET    /api/tenants/:id/stats          - Statistieken per tenant`);
  console.log(`  GET    /conversations                  - Alle gesprekken`);
  console.log(`  POST   /conversations/:id/message      - Bericht sturen`);
  console.log("");
});
