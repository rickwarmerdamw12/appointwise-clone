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
 *
 * NIEUW: De kwalificatievragen zijn aangepast voor de Meta lead form flow.
 * De bot kent al naam, telefoon, email, bedrijf en website (vanuit Meta).
 * De vragen hieronder zijn de EXTRA kwalificatievragen die de bot stelt.
 */

import { TenantStore } from "./tenant"; // Importeer de TenantStore klasse

/**
 * Hoofdfunctie die de seed uitvoert.
 *
 * We maken een TenantStore aan, controleren of Bureau-Assist al bestaat,
 * en maken het aan als dat niet het geval is.
 *
 * De standaardvragen zijn specifiek voor Bureau-Assist's kwalificatieproces:
 * 1. Branche — om te bepalen of de lead in een relevante sector zit
 * 2. Huidige marketing — om het niveau van de lead te begrijpen
 * 3. Gewenst aantal klanten — om de ambitie en schaal te peilen
 * 4. Eerdere advertenties — om ervaring met online marketing te toetsen
 * 5. Budget — de belangrijkste vraag (minimaal €500/maand voor kwalificatie)
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
    agentTone: "Vriendelijk, professioneel, to the point. Geen lange verhalen. Kort en bondig, max 2-3 zinnen per bericht.",
    // De toon bepaalt HOE de agent praat. Dit wordt meegestuurd als instructie aan Claude.

    // === KWALIFICATIEVRAGEN ===
    // Dit zijn de EXTRA vragen die de agent stelt NADAT de basisinfo al bekend is
    // vanuit het Meta lead formulier (naam, telefoon, email, bedrijf, website).
    // De agent stelt deze vragen ÉÉN voor ÉÉN in het WhatsApp-gesprek.
    //
    // BELANGRIJK: De volgorde is bewust gekozen:
    // - We beginnen met een makkelijke vraag (branche) om het gesprek te openen
    // - We bouwen op naar de cruciale vraag (budget) aan het einde
    qualificationQuestions: [
      "Welke branche zit je in?", // Vraag 1: Bepaal of de lead in een relevante sector zit
      "Hoe doe je nu aan marketing om klanten te werven?", // Vraag 2: Begrijp de huidige aanpak
      "Hoeveel nieuwe klanten wil je per maand?", // Vraag 3: Peil de ambitie en schaal
      "Heb je eerder advertenties gedraaid op social media?", // Vraag 4: Toets online marketing ervaring
      "Wat is je maandelijks marketing budget?", // Vraag 5: De cruciale budget-vraag
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
    // Dit webhookSecret wordt ook gebruikt als Meta verify_token
    // bij het opzetten van de Meta webhook. Kies een sterk, uniek wachtwoord.
    webhookSecret: "", // Optioneel: een geheim wachtwoord om webhook-verzoeken te verifiëren
  });

  // Bevestig dat de tenant is aangemaakt
  console.log(`[Seed] Standaard tenant "Bureau-Assist" succesvol aangemaakt!`);
  console.log(`[Seed] Je kunt de app nu starten met: npm run dev`);
}

// Voer de seed-functie uit
seed();
