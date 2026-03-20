/**
 * Seed Bestand (Zaadbestand — Standaardgegevens Aanmaken)
 *
 * Dit bestand maakt een standaard tenant aan: "Bureau-Assist".
 * Draai dit bestand als je de app voor het eerst opstart,
 * zodat er al een voorbeeld-tenant klaarstaat om mee te testen.
 *
 * GEBRUIK: npx ts-node src/seed.ts
 *
 * WAT IS "SEEDING"?
 * In softwareontwikkeling is "seeding" het vullen van je database
 * (of in ons geval, een JSON-bestand) met standaardgegevens.
 * Zo hoef je niet elke keer handmatig gegevens in te voeren bij het testen.
 */

import { TenantStore } from "./tenant"; // Importeer de TenantStore klasse

/**
 * Hoofdfunctie die de seed uitvoert.
 *
 * We maken een TenantStore aan, controleren of Bureau-Assist al bestaat,
 * en maken het aan als dat niet het geval is.
 */
function seed(): void {
  // Maak een nieuwe TenantStore aan — deze laadt automatisch bestaande tenants
  const tenantStore = new TenantStore();

  // De unieke ID voor onze standaard-tenant
  const defaultTenantId = "bureau-assist";

  // Check of deze tenant al bestaat (om dubbele aanmaak te voorkomen)
  const existing = tenantStore.get(defaultTenantId);
  if (existing) {
    console.log(`[Seed] Tenant "${defaultTenantId}" bestaat al. Overslaan.`);
    return;
  }

  // Maak de standaard "Bureau-Assist" tenant aan met alle benodigde instellingen
  tenantStore.create({
    id: defaultTenantId,

    // === BEDRIJFSINFORMATIE ===
    businessName: "Bureau-Assist", // De naam van het bedrijf
    bookingUrl: "https://app.pocketlead.nl/boek/kennismakingsgesprek", // URL om afspraken te boeken

    // === AI-AGENT INSTELLINGEN ===
    agentName: "Lisa", // De naam die de chatbot gebruikt
    agentTone: "Vriendelijk, professioneel, to the point. Geen lange verhalen.",
    // De toon bepaalt HOE de agent praat. Dit wordt meegestuurd als instructie aan Claude.

    // === KWALIFICATIEVRAGEN ===
    // Dit zijn de vragen die de agent stelt om te bepalen of een lead geschikt is.
    // De volgorde is belangrijk: we beginnen breed en worden specifieker.
    qualificationQuestions: [
      "Wat voor bedrijf heeft u?", // Vraag 1: Begrijp wat ze doen
      "Wat is uw huidige manier om nieuwe klanten te werven?", // Vraag 2: Huidige marketing
      "Hoeveel nieuwe klanten wilt u per maand binnenhalen?", // Vraag 3: Ambitie/schaal
      "Heeft u eerder gewerkt met online advertenties?", // Vraag 4: Ervaring
      "Wat is uw budget voor marketing per maand?", // Vraag 5: Budget (de cruciale vraag)
    ],

    // === KWALIFICATIECRITERIA ===
    minBudget: 500, // Minimaal 500 euro per maand — leads met minder budget passen niet
    idealIndustries: [
      "coaching", // Life coaches, business coaches
      "consultancy", // Adviesbureaus
      "training", // Opleidingsbedrijven
      "dienstverlening", // Algemene dienstverlening
      "fitness", // Sportscholen, personal trainers
      "gezondheid", // Gezondheidszorg, fysiotherapie, etc.
    ],

    // === API-SLEUTELS ===
    // LET OP: Vul hier je ECHTE API-sleutels in!
    // De placeholder-waarden werken niet — je moet ze vervangen.
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || "sk-ant-jouw-sleutel-hier",
    // De API-sleutel voor Claude. Haal deze op bij: https://console.anthropic.com/

    // === TWILIO INSTELLINGEN ===
    // Twilio is de dienst die we gebruiken om WhatsApp-berichten te sturen/ontvangen.
    // Je kunt een gratis testaccount aanmaken op: https://www.twilio.com/
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || "",
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || "",
    twilioPhoneNumber: process.env.TWILIO_WHATSAPP_NUMBER || "whatsapp:+14155238886",
    // Het Twilio Sandbox nummer voor WhatsApp-testen

    // === BEVEILIGING ===
    webhookSecret: "", // Optioneel: een geheim wachtwoord om webhook-verzoeken te verifiëren
  });

  // Bevestig dat de tenant is aangemaakt
  console.log(`[Seed] Standaard tenant "Bureau-Assist" succesvol aangemaakt!`);
  console.log(`[Seed] Je kunt de app nu starten met: npm run dev`);
}

// Voer de seed-functie uit
seed();
