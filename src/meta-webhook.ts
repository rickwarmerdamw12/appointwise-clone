/**
 * Meta Webhook Receiver (Meta Lead Formulier Ontvanger)
 *
 * Dit bestand ontvangt leads die binnenkomen via Meta (Facebook/Instagram) advertenties.
 *
 * === WAT IS EEN META LEAD FORM? ===
 * Als je een advertentie draait op Facebook of Instagram, kun je een "lead form"
 * toevoegen. Dit is een formulier dat gebruikers DIRECT in de app kunnen invullen
 * (zonder naar een externe website te gaan). De gebruiker vult in:
 * - Naam
 * - Telefoonnummer
 * - E-mailadres
 * - Bedrijfsnaam
 * - Website
 *
 * === HOE WERKT DE WEBHOOK? ===
 * 1. Een potentiële klant ziet onze advertentie op Facebook/Instagram
 * 2. Ze klikken op de advertentie en vullen het lead formulier in
 * 3. Meta stuurt de ingevulde gegevens naar onze webhook URL (dit bestand!)
 * 4. Wij ontvangen de gegevens en starten automatisch een WhatsApp-gesprek
 * 5. De bot begroet de lead bij naam en begint met kwalificatievragen
 *
 * === WEBHOOK VERIFICATIE ===
 * Meta vereist een verificatie-stap voordat je webhooks kunt ontvangen:
 * - Meta stuurt een GET-verzoek met een "challenge" parameter
 * - Wij sturen de challenge terug als bewijs dat we de webhook beheren
 * - Daarna stuurt Meta de echte lead-data via POST-verzoeken
 *
 * === VEILIGHEID ===
 * We verifiëren dat het verzoek ECHT van Meta komt door:
 * - De verify_token te controleren bij het opzetten van de webhook
 * - De tenant te verifiëren bij elk inkomend lead-verzoek
 */

import { Router, Request, Response } from "express"; // Express Router voor HTTP-routes
import twilio from "twilio"; // Twilio SDK voor het versturen van WhatsApp-berichten
import {
  tenantStore,
  store,
  startConversationWithLeadData,
} from "./agent"; // Agent-functies en data-stores
import { type Tenant } from "./tenant"; // Tenant type-definitie
import { type MetaLeadData } from "./conversation"; // Het interface voor Meta lead data

/**
 * Maak een nieuwe Express Router aan voor Meta webhook verzoeken.
 * Deze router wordt in server.ts gemount op /webhook/meta.
 *
 * Een Router is als een mini-server: je definieert routes erin,
 * en koppelt de router later aan de hoofdserver.
 */
const router = Router();

/**
 * Cache voor Twilio-clients per tenant.
 *
 * Net als in webhook.ts cachen we Twilio-clients zodat we niet bij elk
 * verzoek een nieuwe client hoeven aan te maken. Dit spaart geheugen en
 * maakt de app sneller.
 *
 * Map<string, twilio.Twilio> = woordenboek van tenant-ID naar Twilio-client
 */
const twilioClients: Map<string, twilio.Twilio> = new Map();

/**
 * Haal de Twilio client op voor een specifieke tenant.
 * Als er nog geen client bestaat, maak er een aan en sla die op in de cache.
 *
 * @param tenant - Het tenant-object met de Twilio-instellingen
 * @returns De Twilio client, of null als Twilio niet geconfigureerd is
 *
 * Voorbeeld:
 * const client = getTwilioClient(myTenant);
 * if (client) {
 *   await client.messages.create({ from: "...", to: "...", body: "Hoi!" });
 * }
 */
function getTwilioClient(tenant: Tenant): twilio.Twilio | null {
  // Controleer of de tenant Twilio-gegevens heeft ingesteld
  if (!tenant.twilioAccountSid || !tenant.twilioAuthToken) {
    return null; // Geen Twilio-config = kan geen WhatsApp-berichten sturen
  }

  // Kijk in de cache of er al een client is voor deze tenant
  let client = twilioClients.get(tenant.id);

  if (!client) {
    // Nog geen client? Maak er een aan met de Twilio-inloggegevens van de tenant
    client = twilio(tenant.twilioAccountSid, tenant.twilioAuthToken);
    twilioClients.set(tenant.id, client); // Bewaar in de cache voor hergebruik
  }

  return client;
}

/**
 * Stuur een WhatsApp-bericht naar een lead via Twilio.
 *
 * Deze functie wordt gebruikt om het eerste bericht te sturen naar een lead
 * die binnenkomt via een Meta advertentie. Het bericht bevat de begroeting
 * van de bot (met de naam van de lead) en de eerste kwalificatievraag.
 *
 * @param tenant - De tenant namens wie we het bericht sturen
 * @param to - Het telefoonnummer van de lead (bijv. "+31612345678")
 * @param body - De tekst die we willen sturen
 *
 * LET OP: Het telefoonnummer moet in WhatsApp-formaat zijn: "whatsapp:+31612345678"
 * Als het nummer niet begint met "whatsapp:", voegen we dat automatisch toe.
 */
async function sendWhatsAppMessage(tenant: Tenant, to: string, body: string): Promise<void> {
  const client = getTwilioClient(tenant);

  if (!client) {
    // Als Twilio niet geconfigureerd is, loggen we het bericht
    // Dit is normaal tijdens ontwikkeling/testen zonder Twilio-account
    console.warn(
      `[Meta Webhook] Twilio niet geconfigureerd voor ${tenant.businessName} — bericht niet verzonden:`,
      body
    );
    return;
  }

  // Zorg dat het telefoonnummer in WhatsApp-formaat is
  // Twilio vereist het prefix "whatsapp:" voor WhatsApp-berichten
  const whatsappTo = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;

  // Verstuur het bericht via de Twilio API
  await client.messages.create({
    from: tenant.twilioPhoneNumber, // Verstuur VANUIT het WhatsApp-nummer van de tenant
    to: whatsappTo, // Naar het WhatsApp-nummer van de lead
    body, // De berichttekst (begroeting + eerste vraag)
  });

  // Log het verstuurde bericht
  console.log(`[Meta Webhook] WhatsApp bericht verstuurd naar ${to}`);
}

/**
 * GET /webhook/meta
 *
 * === META WEBHOOK VERIFICATIE ===
 *
 * Voordat Meta lead-data naar ons stuurt, moeten we bewijzen dat WIJ
 * de eigenaar van deze webhook zijn. Dit werkt als volgt:
 *
 * 1. Je configureert de webhook URL in het Meta Developer Dashboard
 * 2. Je voert daar een "verify token" in (een zelfgekozen geheim wachtwoord)
 * 3. Meta stuurt een GET-verzoek naar onze URL met:
 *    - hub.mode: "subscribe" (Meta wil zich abonneren op onze webhook)
 *    - hub.verify_token: het wachtwoord dat je in het dashboard hebt ingevoerd
 *    - hub.challenge: een willekeurige tekst die we moeten terugsturen
 * 4. Als het wachtwoord klopt, sturen we de challenge terug
 * 5. Meta bevestigt de webhook en begint met het sturen van lead-data
 *
 * VEILIGHEID: Het verify_token zorgt ervoor dat alleen Meta onze webhook
 * kan activeren. Een aanvaller die onze URL kent, kan geen valse webhook opzetten
 * zonder het wachtwoord te kennen.
 */
router.get("/", (req: Request, res: Response) => {
  // Lees de parameters uit de URL (query string)
  const mode = req.query["hub.mode"] as string; // Moet "subscribe" zijn
  const token = req.query["hub.verify_token"] as string; // Het geheime wachtwoord
  const challenge = req.query["hub.challenge"] as string; // De challenge die we moeten terugsturen

  // Zoek een tenant die dit verify_token gebruikt als webhookSecret
  // Elke tenant kan zijn eigen verify_token instellen
  const tenants = tenantStore.getAll();
  const matchingTenant = tenants.find((t) => t.webhookSecret && t.webhookSecret === token);

  // Controleer of het een geldige verificatie-aanvraag is
  if (mode === "subscribe" && matchingTenant) {
    // Alles klopt! Stuur de challenge terug als bewijs
    console.log(`[Meta Webhook] Webhook geverifieerd voor tenant: ${matchingTenant.businessName}`);
    res.status(200).send(challenge);
  } else {
    // Verificatie mislukt — ongeldig token of mode
    console.warn(`[Meta Webhook] Webhook verificatie mislukt. Mode: ${mode}, Token: ${token}`);
    res.status(403).send("Verificatie mislukt");
  }
});

/**
 * POST /webhook/meta
 *
 * === META LEAD DATA ONTVANGEN ===
 *
 * Dit endpoint ontvangt de ECHTE lead-data wanneer iemand een Meta lead
 * formulier invult. Meta stuurt de data in een specifiek JSON-formaat.
 *
 * Meta webhook payload structuur (vereenvoudigd):
 * {
 *   "object": "page",
 *   "entry": [{
 *     "id": "pagina-id",
 *     "time": 1234567890,
 *     "changes": [{
 *       "field": "leadgen",
 *       "value": {
 *         "form_id": "formulier-id",
 *         "leadgen_id": "lead-id",
 *         "field_data": [
 *           { "name": "full_name", "values": ["Jan de Vries"] },
 *           { "name": "phone_number", "values": ["+31612345678"] },
 *           { "name": "email", "values": ["jan@bedrijf.nl"] },
 *           { "name": "company_name", "values": ["De Vries BV"] },
 *           { "name": "website", "values": ["https://devries.nl"] }
 *         ]
 *       }
 *     }]
 *   }]
 * }
 *
 * Wij ondersteunen OOK een vereenvoudigd formaat voor directe API-aanroepen:
 * {
 *   "tenantId": "bureau-assist",
 *   "naam": "Jan de Vries",
 *   "telefoon": "+31612345678",
 *   "email": "jan@bedrijf.nl",
 *   "bedrijf": "De Vries BV",
 *   "website": "https://devries.nl"
 * }
 *
 * FLOW na ontvangst:
 * 1. Parse de lead-data uit de webhook payload
 * 2. Zoek de juiste tenant op
 * 3. Start een gesprek met pre-filled lead data
 * 4. Stuur de eerste WhatsApp-begroeting naar de lead
 */
router.post("/", async (req: Request, res: Response) => {
  // Log de binnenkomende webhook payload (handig voor debugging)
  console.log("[Meta Webhook] Inkomende webhook ontvangen:", JSON.stringify(req.body).substring(0, 500));

  try {
    // === BEPAAL HET FORMAAT VAN DE PAYLOAD ===
    // We ondersteunen twee formaten:
    // 1. Het officiële Meta webhook formaat (met "object" en "entry")
    // 2. Een vereenvoudigd formaat voor directe API-aanroepen (handig voor testen)

    if (req.body.object === "page" && req.body.entry) {
      // === META WEBHOOK FORMAAT ===
      // Loop door alle "entries" (Meta kan meerdere leads tegelijk sturen)
      await handleMetaWebhookPayload(req.body);
      res.status(200).send("EVENT_RECEIVED");
    } else if (req.body.tenantId && req.body.naam && req.body.telefoon) {
      // === VEREENVOUDIGD FORMAAT ===
      // Dit formaat is handig voor directe API-aanroepen en testen
      await handleSimplifiedPayload(req.body);
      res.status(200).json({ success: true, message: "Lead ontvangen en gesprek gestart" });
    } else {
      // Onbekend formaat — stuur een foutmelding terug
      console.warn("[Meta Webhook] Onbekend payload formaat:", JSON.stringify(req.body).substring(0, 200));
      res.status(400).json({ error: "Ongeldig formaat. Verwacht Meta webhook of vereenvoudigd formaat." });
    }
  } catch (error) {
    // Als er iets misgaat, log de fout en stuur een 500-foutmelding
    console.error("[Meta Webhook] Fout bij verwerken van webhook:", error);
    res.status(500).json({ error: "Interne serverfout bij verwerken van Meta webhook" });
  }
});

/**
 * Verwerk een officiële Meta webhook payload.
 *
 * Meta stuurt lead-data in een genest formaat. Deze functie:
 * 1. Loopt door alle "entries" (elke entry = één lead)
 * 2. Zoekt de "leadgen" change (het type event voor lead formulieren)
 * 3. Haalt de field_data eruit (naam, telefoon, email, etc.)
 * 4. Start een gesprek voor elke lead
 *
 * @param payload - De volledige Meta webhook payload
 */
async function handleMetaWebhookPayload(payload: MetaWebhookPayload): Promise<void> {
  // Loop door alle entries (meestal is er maar één, maar Meta kan er meerdere sturen)
  for (const entry of payload.entry) {
    // Controleer of er "changes" zijn (dit bevat de lead-data)
    if (!entry.changes) continue;

    // Loop door alle changes en zoek naar "leadgen" events
    for (const change of entry.changes) {
      // "leadgen" is het type event voor lead formulier-inzendingen
      if (change.field !== "leadgen") continue;

      // Haal de field_data eruit — dit zijn de velden die de lead heeft ingevuld
      const fieldData = change.value?.field_data;
      if (!fieldData) continue;

      // Extraheer de individuele velden uit de field_data array
      // Elk veld heeft een "name" en een "values" array (we pakken altijd de eerste waarde)
      const naam = getFieldValue(fieldData, "full_name") || "Onbekend";
      const telefoon = getFieldValue(fieldData, "phone_number") || "";
      const email = getFieldValue(fieldData, "email") || "";
      const bedrijf = getFieldValue(fieldData, "company_name") || "";
      const website = getFieldValue(fieldData, "website") || "";

      // Controleer of we een telefoonnummer hebben (dat is essentieel voor WhatsApp)
      if (!telefoon) {
        console.warn("[Meta Webhook] Geen telefoonnummer gevonden in Meta lead data — overslaan");
        continue;
      }

      // Zoek de eerste tenant met een geconfigureerd webhookSecret
      // In een productie-omgeving zou je de tenant koppelen aan de Meta pagina-ID
      const tenants = tenantStore.getAll();
      const tenant = tenants.find((t) => t.webhookSecret) || tenants[0];

      if (!tenant) {
        console.error("[Meta Webhook] Geen tenant gevonden om lead aan toe te wijzen");
        continue;
      }

      // Start het gesprek met de pre-filled lead data
      const metaData: MetaLeadData = { naam, telefoon, email, bedrijf, website };
      await startLeadConversation(tenant, metaData);
    }
  }
}

/**
 * Verwerk een vereenvoudigd lead payload (voor directe API-aanroepen en testen).
 *
 * Dit formaat is makkelijker te gebruiken dan het officiële Meta formaat.
 * Je kunt het gebruiken om leads handmatig toe te voegen via de API,
 * of om het systeem te testen zonder een echte Meta-integratie.
 *
 * Voorbeeld API-aanroep:
 * curl -X POST http://localhost:3000/webhook/meta \
 *   -H "Content-Type: application/json" \
 *   -d '{"tenantId": "bureau-assist", "naam": "Jan", "telefoon": "+31612345678", "email": "jan@test.nl", "bedrijf": "Jan BV", "website": "jan.nl"}'
 *
 * @param body - De vereenvoudigde payload met tenantId en lead-gegevens
 */
async function handleSimplifiedPayload(body: SimplifiedLeadPayload): Promise<void> {
  // Zoek de tenant op basis van het meegegeven tenantId
  const tenant = tenantStore.get(body.tenantId);

  if (!tenant) {
    console.error(`[Meta Webhook] Tenant niet gevonden: ${body.tenantId}`);
    return;
  }

  // Bouw de MetaLeadData op vanuit de vereenvoudigde payload
  const metaData: MetaLeadData = {
    naam: body.naam,
    telefoon: body.telefoon,
    email: body.email || "",
    bedrijf: body.bedrijf || "",
    website: body.website || "",
  };

  // Start het gesprek met de pre-filled lead data
  await startLeadConversation(tenant, metaData);
}

/**
 * Start een WhatsApp-gesprek met een nieuwe lead.
 *
 * Dit is de kern van de Meta webhook flow:
 * 1. Maak een gesprek aan met de pre-filled lead data
 * 2. Genereer een persoonlijke begroeting (met naam + eerste kwalificatievraag)
 * 3. Stuur deze begroeting via WhatsApp naar de lead
 *
 * @param tenant - De tenant die deze lead ontvangt
 * @param metaData - De lead data vanuit het Meta formulier
 */
async function startLeadConversation(tenant: Tenant, metaData: MetaLeadData): Promise<void> {
  // Gebruik het telefoonnummer als gesprek-ID (uniek per lead)
  // Verwijder het "+" teken en eventuele spaties
  const conversationId = metaData.telefoon.replace(/[+\s]/g, "");

  // Controleer of er al een gesprek bestaat met dit telefoonnummer
  // (voorkom dubbele gesprekken als Meta de webhook opnieuw stuurt)
  const existing = store.get(conversationId);
  if (existing) {
    console.log(`[Meta Webhook] Gesprek bestaat al voor ${metaData.naam} (${conversationId}) — overslaan`);
    return;
  }

  // Start het gesprek met pre-filled data en ontvang de begroeting
  const greeting = await startConversationWithLeadData(tenant.id, conversationId, metaData);

  // Stuur de begroeting via WhatsApp naar de lead
  // Dit is het EERSTE bericht dat de lead ontvangt na het invullen van het formulier
  await sendWhatsAppMessage(tenant, metaData.telefoon, greeting);

  // Log de succesvolle lead-ontvangst
  console.log(`[Meta Webhook] ✅ Nieuwe lead verwerkt: ${metaData.naam} (${metaData.telefoon}) -> ${tenant.businessName}`);
}

/**
 * Hulpfunctie: Haal een specifiek veld op uit Meta's field_data array.
 *
 * Meta stuurt velden als een array van objecten, elk met "name" en "values":
 * [
 *   { "name": "full_name", "values": ["Jan de Vries"] },
 *   { "name": "email", "values": ["jan@test.nl"] }
 * ]
 *
 * Deze functie zoekt het veld op naam en geeft de eerste waarde terug.
 *
 * @param fieldData - De array met alle velden uit het Meta formulier
 * @param fieldName - De naam van het veld dat we zoeken (bijv. "full_name")
 * @returns De waarde van het veld, of undefined als het niet gevonden is
 */
function getFieldValue(fieldData: MetaFieldData[], fieldName: string): string | undefined {
  // Zoek het veld met de juiste naam
  const field = fieldData.find((f) => f.name === fieldName);
  // Geef de eerste waarde terug (Meta stuurt een array, maar er is meestal maar één waarde)
  return field?.values?.[0];
}

// ============================================
// === TYPE DEFINITIES VOOR META WEBHOOKS ===
// ============================================

/**
 * Type voor een enkel veld uit Meta's field_data.
 *
 * Elk veld heeft:
 * - name: de technische naam (bijv. "full_name", "phone_number")
 * - values: een array van waarden (meestal maar één waarde)
 *
 * Meta gebruikt standaard veldnamen:
 * - "full_name" = volledige naam
 * - "phone_number" = telefoonnummer
 * - "email" = e-mailadres
 * - "company_name" = bedrijfsnaam
 * - "website" = website URL
 */
interface MetaFieldData {
  name: string;
  values: string[];
}

/**
 * Type voor de "value" in een Meta leadgen change.
 * Dit bevat de daadwerkelijke lead-data met alle ingevulde velden.
 */
interface MetaLeadValue {
  form_id?: string; // Het ID van het lead formulier
  leadgen_id?: string; // Het unieke ID van deze lead-inzending
  field_data: MetaFieldData[]; // De ingevulde velden
}

/**
 * Type voor een "change" in een Meta webhook entry.
 * Elke change heeft een type (field) en de bijbehorende data (value).
 */
interface MetaChange {
  field: string; // Het type event (bijv. "leadgen" voor lead formulieren)
  value?: MetaLeadValue; // De bijbehorende data
}

/**
 * Type voor een "entry" in de Meta webhook payload.
 * Elke entry vertegenwoordigt een event op een Meta-pagina.
 */
interface MetaEntry {
  id: string; // De ID van de Meta-pagina
  time: number; // Het tijdstip van het event (Unix timestamp)
  changes?: MetaChange[]; // De veranderingen (events) die plaatsvonden
}

/**
 * Type voor de volledige Meta webhook payload.
 * Dit is het formaat dat Meta stuurt bij elk webhook-event.
 */
interface MetaWebhookPayload {
  object: string; // Altijd "page" voor pagina-gerelateerde events
  entry: MetaEntry[]; // Een array van entries (events)
}

/**
 * Type voor het vereenvoudigde payload formaat.
 * Dit formaat is handig voor directe API-aanroepen en testen.
 * Het is makkelijker te gebruiken dan het officiële Meta formaat.
 */
interface SimplifiedLeadPayload {
  tenantId: string; // De ID van de tenant die de lead ontvangt
  naam: string; // De naam van de lead
  telefoon: string; // Het telefoonnummer van de lead
  email?: string; // Het e-mailadres (optioneel)
  bedrijf?: string; // De bedrijfsnaam (optioneel)
  website?: string; // De website URL (optioneel)
}

// Exporteer de router zodat server.ts hem kan mounten op /webhook/meta
export default router;
