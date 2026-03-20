/**
 * WhatsApp Webhook Handler (WhatsApp Berichtenverwerker)
 *
 * Dit bestand verwerkt inkomende WhatsApp-berichten via Twilio.
 *
 * HOE WERKT EEN WEBHOOK?
 * Een webhook is als een "luisterpost". Als iemand een WhatsApp-bericht stuurt
 * naar ons nummer, stuurt Twilio dat bericht door naar ONZE server via een
 * HTTP POST-verzoek. Wij verwerken het bericht en sturen een antwoord terug.
 *
 * MULTI-TENANT ROUTING:
 * Nu we meerdere tenants (klanten) ondersteunen, moeten we uitzoeken welk
 * bericht bij welke tenant hoort. Dat doen we door te kijken naar welk
 * telefoonnummer het bericht ONTVANGT (het "To"-nummer).
 * Elke tenant heeft zijn eigen Twilio-nummer.
 */

import { Router, Request, Response } from "express"; // Express Router voor HTTP-routes
import twilio from "twilio"; // Twilio SDK voor het sturen van WhatsApp-berichten
import { tenantStore, handleMessage, startConversation, getConversation } from "./agent"; // Agent-functies
import { type Tenant } from "./tenant"; // Tenant type-definitie

/**
 * Maak een nieuwe Express Router aan.
 * Een Router is als een mini-server die je kunt koppelen aan een hoofdserver.
 * Alle routes die we hier definiëren, werken relatief aan waar de router gemount wordt.
 */
const router = Router();

/**
 * Cache voor Twilio-clients per tenant.
 *
 * Net als bij Anthropic-clients willen we niet steeds een nieuwe Twilio-client
 * aanmaken. We slaan ze op na de eerste keer.
 */
const twilioClients: Map<string, twilio.Twilio> = new Map();

/**
 * Haal de Twilio client op voor een specifieke tenant.
 * Als er nog geen client bestaat voor deze tenant, maak er dan een aan.
 *
 * @param tenant - Het tenant-object met Twilio-instellingen
 * @returns De Twilio client, of null als Twilio niet geconfigureerd is
 */
function getTwilioClient(tenant: Tenant): twilio.Twilio | null {
  // Controleer of de tenant Twilio heeft geconfigureerd
  if (!tenant.twilioAccountSid || !tenant.twilioAuthToken) {
    return null; // Geen Twilio-gegevens = kan geen berichten sturen
  }

  // Kijk of we al een client hebben voor deze tenant
  let client = twilioClients.get(tenant.id);

  if (!client) {
    // Maak een nieuwe Twilio client aan met de inloggegevens van deze tenant
    client = twilio(tenant.twilioAccountSid, tenant.twilioAuthToken);
    twilioClients.set(tenant.id, client); // Bewaar in cache
  }

  return client;
}

/**
 * Stuur een WhatsApp-bericht via Twilio.
 *
 * @param tenant - De tenant namens wie we het bericht sturen
 * @param to - Het telefoonnummer van de ontvanger (bijv. "whatsapp:+31612345678")
 * @param body - De tekst die we willen sturen
 */
async function sendWhatsAppMessage(tenant: Tenant, to: string, body: string): Promise<void> {
  const client = getTwilioClient(tenant);

  if (!client) {
    // Als Twilio niet geconfigureerd is, loggen we het bericht in de console
    // Dit is handig tijdens het ontwikkelen/testen
    console.warn(`[WhatsApp] Twilio niet geconfigureerd voor ${tenant.businessName} - bericht niet verzonden:`, body);
    return;
  }

  // Stuur het bericht via de Twilio API
  await client.messages.create({
    from: tenant.twilioPhoneNumber, // Verstuur VANUIT het nummer van de tenant
    to, // Naar het nummer van de lead
    body, // De berichttekst
  });
}

/**
 * POST /webhook/whatsapp
 *
 * Dit is de webhook-route die Twilio aanroept als er een WhatsApp-bericht binnenkomt.
 *
 * Twilio stuurt een HTTP POST met de volgende gegevens:
 * - From: het telefoonnummer van de afzender (bijv. "whatsapp:+31612345678")
 * - To: het telefoonnummer waarop het bericht ontvangen is (ons nummer)
 * - Body: de tekst van het bericht
 * - ProfileName: de WhatsApp-profielnaam van de afzender
 *
 * FLOW:
 * 1. Zoek de tenant op basis van het "To"-nummer
 * 2. Als het een nieuw gesprek is, start met een begroeting
 * 3. Verwerk het bericht via de AI-agent
 * 4. Stuur het antwoord terug via WhatsApp
 * 5. Bevestig aan Twilio dat we het bericht verwerkt hebben
 */
router.post("/whatsapp", async (req: Request, res: Response) => {
  // Destructureer de binnenkomende gegevens van Twilio
  const {
    From: from, // Telefoonnummer van de lead
    To: to, // Telefoonnummer waarop het bericht binnenkwam (= ons Twilio-nummer)
    Body: body, // De tekst van het bericht
    ProfileName: profileName, // WhatsApp-profielnaam van de afzender
  } = req.body;

  // Controleer of de verplichte velden aanwezig zijn
  if (!from || !body) {
    res.status(400).json({ error: "Verplichte velden 'From' en 'Body' ontbreken" });
    return;
  }

  // === MULTI-TENANT ROUTING ===
  // Zoek de tenant op basis van het telefoonnummer waarop het bericht binnenkwam.
  // Het "To"-veld vertelt ons welk Twilio-nummer gebruikt werd.
  const tenant = to ? tenantStore.getByPhoneNumber(to) : undefined;

  if (!tenant) {
    // Geen tenant gevonden voor dit nummer — we weten niet voor wie dit bericht is
    console.warn(`[WhatsApp] Geen tenant gevonden voor nummer: ${to}`);
    res.status(404).json({ error: "Geen tenant geconfigureerd voor dit nummer" });
    return;
  }

  // Gebruik het telefoonnummer van de lead als gesprek-ID (zonder "whatsapp:" prefix)
  const conversationId = from.replace("whatsapp:", "");

  // Log het inkomende bericht (handig voor debugging)
  console.log(`[WhatsApp] [${tenant.businessName}] ${profileName || from}: ${body}`);

  try {
    // Controleer of dit een NIEUW gesprek is (lead neemt voor het eerst contact op)
    const existing = getConversation(conversationId);

    if (!existing) {
      // Nieuw gesprek! Start met een begroeting
      const greeting = await startConversation(tenant.id, conversationId, profileName);
      // Stuur de begroeting naar de lead via WhatsApp
      await sendWhatsAppMessage(tenant, from, greeting);
    }

    // Verwerk het bericht via de AI-agent en krijg een antwoord terug
    const reply = await handleMessage(tenant.id, conversationId, body);
    console.log(`[${tenant.agentName}] -> ${from}: ${reply}`);

    // Stuur het antwoord van de agent terug naar de lead
    await sendWhatsAppMessage(tenant, from, reply);

    // Stuur een lege TwiML-response terug naar Twilio
    // TwiML is Twilio's eigen XML-formaat. Een lege <Response></Response>
    // vertelt Twilio: "We hebben het bericht verwerkt, geen verdere actie nodig."
    res.type("text/xml").send("<Response></Response>");
  } catch (error) {
    // Als er iets misgaat, stuur een 500-foutmelding terug
    console.error("[WhatsApp] Webhook fout:", error);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// Exporteer de router zodat server.ts hem kan gebruiken
export default router;
