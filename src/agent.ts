/**
 * AI Appointment Setting Agent (AI Afspraken-bot)
 *
 * Dit is het HART van de applicatie. Hier praat onze AI-agent met leads.
 *
 * HOE WERKT HET?
 * 1. Een lead komt binnen via een Meta advertentie (Facebook/Instagram)
 * 2. De lead heeft al basisinfo ingevuld: naam, telefoon, email, bedrijf, website
 * 3. De bot begroet de lead bij NAAM en stelt alleen EXTRA kwalificatievragen
 * 4. Na 2-5 vragen bepaalt de bot of de lead geschikt is
 * 5. Geschikt? -> Stuur een boekingslink voor een kennismakingsgesprek
 * 6. Niet geschikt? -> Wijs vriendelijk af met uitleg waarom
 *
 * BELANGRIJK: De bot vraagt NOOIT naar naam, telefoon, email, bedrijf of website.
 * Deze informatie is al bekend vanuit het Meta lead formulier.
 * De bot stelt alleen de kwalificatievragen (branche, marketing, budget, etc.)
 *
 * MULTI-TENANT: Elke tenant heeft eigen instellingen (eigen agent-naam, eigen vragen, etc.)
 * De AI-agent past zich aan per tenant.
 */

import Anthropic from "@anthropic-ai/sdk"; // De officiële Anthropic SDK om met Claude te praten
import { ConversationStore, type LeadInfo, type Message, type MetaLeadData } from "./conversation"; // Ons gesprekkengeheugen
import { TenantStore, type Tenant } from "./tenant"; // Het multi-tenant systeem

/**
 * Maak één gedeelde ConversationStore aan.
 * Deze wordt geëxporteerd zodat andere bestanden (server.ts, webhook.ts, meta-webhook.ts)
 * dezelfde gespreksdata kunnen gebruiken.
 */
export const store = new ConversationStore();

/**
 * Maak één gedeelde TenantStore aan.
 * Hiermee kunnen alle delen van de app bij de tenant-gegevens.
 */
export const tenantStore = new TenantStore();

/**
 * Cache voor Anthropic API-clients per tenant.
 *
 * Waarom een cache? Elke tenant heeft zijn eigen API-sleutel.
 * We willen niet bij ELK bericht een nieuwe client aanmaken — dat is verspilling.
 * Dus slaan we de client op na de eerste keer, en hergebruiken we hem daarna.
 *
 * Map<string, Anthropic> = een woordenboek van tenant-ID naar Anthropic-client
 */
const anthropicClients: Map<string, Anthropic> = new Map();

/**
 * Haal de Anthropic client op voor een specifieke tenant.
 * Als de client nog niet bestaat, maak hem aan en sla hem op in de cache.
 *
 * @param tenant - Het tenant-object met de API-sleutel
 * @returns Een Anthropic client die klaar is om berichten te sturen naar Claude
 */
function getAnthropicClient(tenant: Tenant): Anthropic {
  // Kijk of we al een client hebben voor deze tenant
  let client = anthropicClients.get(tenant.id);

  if (!client) {
    // Nog geen client? Maak er eentje aan met de API-sleutel van deze tenant
    client = new Anthropic({ apiKey: tenant.anthropicApiKey });
    anthropicClients.set(tenant.id, client); // Sla op in de cache voor hergebruik
  }

  return client;
}

/**
 * Bouw de "system prompt" voor de AI-agent.
 *
 * De system prompt is als een "handleiding" die je aan de AI geeft.
 * Het vertelt de AI:
 * - Wie ze is (naam, rol)
 * - Hoe ze moet praten (toon, stijl)
 * - Welke informatie BEKEND is (vanuit Meta lead form)
 * - Welke EXTRA vragen ze moet stellen
 * - Wanneer een lead gekwalificeerd is
 * - Welke regels ze moet volgen
 *
 * NIEUW: De prompt bevat nu de pre-filled lead informatie als die beschikbaar is.
 * Zo weet de AI dat ze naam, email, etc. NIET hoeft te vragen.
 *
 * @param tenant - De tenant-instellingen (elke klant heeft andere instructies)
 * @param leadInfo - Optionele pre-filled lead info vanuit Meta (als beschikbaar)
 * @returns Een lange tekst met alle instructies voor Claude
 */
function buildSystemPrompt(tenant: Tenant, leadInfo?: Partial<LeadInfo>): string {
  // We bouwen de vragen-lijst op met nummers (1. vraag, 2. vraag, etc.)
  const questionsFormatted = tenant.qualificationQuestions
    .map((q, i) => `${i + 1}. ${q}`) // 'map' zet elk element om: (vraag, index) => "index. vraag"
    .join("\n"); // Voeg alle vragen samen met een nieuwe regel ertussen

  // De branches waar deze tenant zich op richt, als komma-gescheiden tekst
  const industriesFormatted = tenant.idealIndustries.join(", ");

  // Bouw een sectie met BEKENDE informatie als we pre-filled data hebben
  // Dit vertelt de AI precies wat ze al weet over de lead
  let knownInfoSection = "";
  if (leadInfo && leadInfo.naam) {
    knownInfoSection = `
BEKENDE INFORMATIE (vanuit Meta lead formulier — NOOIT opnieuw vragen!):
- Naam: ${leadInfo.naam}
- Telefoon: ${leadInfo.telefoon || "onbekend"}
- Email: ${leadInfo.email || "onbekend"}
- Bedrijf: ${leadInfo.bedrijf || "onbekend"}
- Website: ${leadInfo.website || "onbekend"}

BELANGRIJK: Je KENT de lead al bij naam. Spreek de lead aan met "${leadInfo.naam}".
Vraag NOOIT naar naam, telefoon, email, bedrijfsnaam of website — dat weet je al.
Stel ALLEEN de extra kwalificatievragen hieronder.
`;
  }

  // Geef de volledige system prompt terug als template literal (backticks)
  // Template literals laten ons variabelen invoegen met ${variabele}
  return `Je bent ${tenant.agentName}, marketing adviseur bij ${tenant.businessName}.

DOEL: Kwalificeer de lead via een kort, vriendelijk WhatsApp-gesprek.
Stel 2-5 extra kwalificatievragen en bepaal of de lead geschikt is voor een kennismakingsgesprek.

STIJL: ${tenant.agentTone}
${knownInfoSection}
EXTRA KWALIFICATIEVRAGEN (stel deze ÉÉN voor ÉÉN):
${questionsFormatted}

KWALIFICATIECRITERIA:
- Heeft een bedrijf in een relevante branche (${industriesFormatted})
- Wil actief nieuwe klanten werven
- Budget van minimaal ${tenant.minBudget} euro per maand
- Openstaat voor samenwerking

REGELS:
- Stel NOOIT meer dan 1 vraag per bericht
- Houd berichten KORT: maximaal 2-3 zinnen per bericht
- Wacht op antwoord voordat je de volgende vraag stelt
- Wees conversationeel en natuurlijk, geen robotachtige toon
- Als de lead niet past: wees eerlijk en vriendelijk, leg kort uit waarom
- Als de lead WEL past: stel voor om een kennismakingsgesprek in te plannen
- Stuur dan de boekingslink: ${tenant.bookingUrl}
- Reageer ALTIJD in het Nederlands
- Wees nooit opdringerig
- Vraag NOOIT naar informatie die je al hebt (naam, email, telefoon, bedrijf, website)

Na het gesprek geef je een JSON samenvatting:
{"gekwalificeerd": true/false, "reden": "korte uitleg", "score": 0-100}`;
}

/**
 * Zet ons interne berichtformaat om naar het formaat dat Claude verwacht.
 *
 * Onze berichten gebruiken "lead" en "agent" als rollen.
 * Claude verwacht "user" en "assistant".
 * Deze functie doet de vertaling.
 *
 * Voorbeeld:
 * Invoer:  [{ role: "lead", content: "Hallo" }]
 * Uitvoer: [{ role: "user", content: "Hallo" }]
 *
 * @param messages - Onze interne berichten
 * @returns Berichten in het formaat dat de Anthropic API verwacht
 */
function formatHistory(messages: Message[]): Array<{ role: "user" | "assistant"; content: string }> {
  return messages.map((m) => ({
    // "lead" wordt "user" (de gebruiker die praat met de AI)
    // "agent" wordt "assistant" (de AI die antwoordt)
    role: m.role === "lead" ? ("user" as const) : ("assistant" as const),
    content: m.content,
  }));
}

/**
 * Verwerk een inkomend bericht van een lead.
 *
 * Dit is de HOOFDFUNCTIE van de agent. Het wordt aangeroepen voor elk bericht
 * dat een lead stuurt (via WhatsApp, API, of CLI).
 *
 * Stappen:
 * 1. Sla het bericht van de lead op
 * 2. Bouw de berichtgeschiedenis op voor Claude
 * 3. Stuur alles naar Claude en krijg een antwoord (met pre-filled lead info in de prompt)
 * 4. Check of Claude een kwalificatie-oordeel heeft gegeven
 * 5. Extraheer lead-informatie uit het gesprek
 * 6. Geef het antwoord terug
 *
 * @param tenantId - De tenant waar dit gesprek bij hoort
 * @param conversationId - Het unieke ID van het gesprek
 * @param leadMessage - Het bericht dat de lead heeft gestuurd
 * @returns Het antwoord van de AI-agent
 */
export async function handleMessage(
  tenantId: string,
  conversationId: string,
  leadMessage: string
): Promise<string> {
  // Zoek de tenant op — we hebben zijn instellingen nodig
  const tenant = tenantStore.get(tenantId);
  if (!tenant) {
    console.error(`[Agent] Tenant niet gevonden: ${tenantId}`);
    return "Sorry, er is een configuratiefout opgetreden.";
  }

  // Haal het gesprek op (of maak een nieuw gesprek aan)
  const conv = store.getOrCreate(conversationId, tenantId);

  // Sla het bericht van de lead op in de gespreksgeschiedenis
  store.addMessage(conversationId, "lead", leadMessage, tenantId);

  // Bouw de berichtgeschiedenis op in het formaat dat Claude verwacht
  const history = formatHistory(conv.messages);

  try {
    // Haal de juiste Anthropic client op voor deze tenant
    const anthropic = getAnthropicClient(tenant);

    // === STUUR HET GESPREK NAAR CLAUDE ===
    // Dit is waar de magie gebeurt: Claude leest het hele gesprek
    // en genereert een slim, contextueel antwoord.
    // NIEUW: We geven de pre-filled leadInfo mee aan de system prompt,
    // zodat Claude weet welke info al bekend is en niet opnieuw gevraagd hoeft te worden.
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514", // Het AI-model dat we gebruiken
      max_tokens: 500, // Maximaal 500 tokens (woorden/woorddelen) per antwoord
      system: buildSystemPrompt(tenant, conv.leadInfo), // Instructies + bekende lead info
      messages: history, // De volledige gespreksgeschiedenis
    });

    // Haal de tekst uit het antwoord van Claude
    // Claude kan verschillende soorten content terugsturen; wij willen alleen tekst
    const agentReply =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Sla het antwoord van de agent op in de gespreksgeschiedenis
    store.addMessage(conversationId, "agent", agentReply, tenantId);

    // === CHECK KWALIFICATIE-OORDEEL ===
    // Als Claude vindt dat het gesprek klaar is, stuurt hij een JSON-samenvatting:
    // {"gekwalificeerd": true/false, "reden": "...", "score": 0-100}
    // We zoeken naar dit patroon in het antwoord met een reguliere expressie (regex)
    const qualMatch = agentReply.match(/\{"gekwalificeerd".*?\}/s);
    if (qualMatch) {
      try {
        // Probeer de JSON te parsen (omzetten van tekst naar een JavaScript object)
        const qual = JSON.parse(qualMatch[0]);

        // Werk de score en status bij in onze gespreksopslag
        store.updateScore(conversationId, qual.score || 0, tenantId);
        store.updateStatus(
          conversationId,
          qual.gekwalificeerd ? "gekwalificeerd" : "niet_gekwalificeerd",
          tenantId
        );
      } catch {
        // Als het JSON-parsen mislukt, is dat niet erg — we gaan gewoon door
        // Dit kan gebeuren als Claude een ongeldig JSON-formaat teruggeeft
      }
    }

    // === EXTRAHEER LEAD-INFORMATIE ===
    // Na elk bericht proberen we gestructureerde info te halen uit het gesprek
    // (branche, marketing, budget, etc. — de kwalificatie-antwoorden)
    await extractLeadInfo(tenant, conversationId);

    return agentReply;
  } catch (error) {
    // Als er iets misgaat (bijv. API-fout), loggen we de fout
    // en sturen we een vriendelijk bericht terug naar de lead
    console.error("[Agent] Fout bij verwerken van bericht:", error);
    return "Sorry, er ging iets mis. Probeer het later opnieuw.";
  }
}

/**
 * Start een nieuw gesprek met een begroeting.
 *
 * Dit wordt aangeroepen als iemand voor het EERST contact opneemt
 * (bijv. via een organisch WhatsApp-bericht, NIET via Meta webhook).
 *
 * Voor Meta-leads gebruik je startConversationWithLeadData() — die functie
 * stuurt een persoonlijke begroeting met de naam van de lead.
 *
 * @param tenantId - De tenant waar dit gesprek bij hoort
 * @param conversationId - Het unieke ID voor het nieuwe gesprek
 * @param leadName - De naam van de lead (optioneel — bijv. van WhatsApp-profiel)
 * @returns De begroetingstekst van de agent
 */
export async function startConversation(
  tenantId: string,
  conversationId: string,
  leadName?: string
): Promise<string> {
  // Zoek de tenant op voor de juiste agent-naam en bedrijfsnaam
  const tenant = tenantStore.get(tenantId);
  if (!tenant) {
    console.error(`[Agent] Tenant niet gevonden: ${tenantId}`);
    return "Sorry, er is een configuratiefout opgetreden.";
  }

  // Maak het gesprek aan (of haal het op als het al bestaat)
  store.getOrCreate(conversationId, tenantId);

  // Als we de naam van de lead weten, sla die op
  if (leadName) {
    store.updateLeadInfo(conversationId, { naam: leadName }, tenantId);
  }

  // Bouw een persoonlijke begroeting op
  // Als we de naam kennen, gebruiken we die. Anders een generieke begroeting.
  const greeting = leadName
    ? `Hoi ${leadName}! Ik ben ${tenant.agentName} van ${tenant.businessName}. Leuk dat je interesse hebt! Mag ik je een paar korte vragen stellen om te kijken hoe we je het beste kunnen helpen?`
    : `Hoi! Ik ben ${tenant.agentName} van ${tenant.businessName}. Leuk dat je interesse hebt! Mag ik je een paar korte vragen stellen om te kijken hoe we je het beste kunnen helpen?`;

  // Sla de begroeting op als eerste bericht in het gesprek
  store.addMessage(conversationId, "agent", greeting, tenantId);
  return greeting;
}

/**
 * Start een nieuw gesprek met PRE-FILLED lead data vanuit Meta.
 *
 * Deze functie wordt aangeroepen door de Meta webhook als er een nieuwe lead binnenkomt.
 * Het verschil met startConversation():
 * - De lead-informatie (naam, telefoon, email, bedrijf, website) is al BEKEND
 * - De begroeting is persoonlijker (spreekt de lead bij naam aan)
 * - Het gesprek begint direct met de eerste kwalificatievraag
 *
 * FLOW:
 * 1. Meta webhook ontvangt lead data
 * 2. Deze functie maakt een gesprek aan met pre-filled data
 * 3. De bot stuurt een persoonlijke begroeting + eerste kwalificatievraag
 * 4. De lead antwoordt en de kwalificatie begint
 *
 * @param tenantId - De tenant waar deze lead bij hoort
 * @param conversationId - Het unieke ID voor het gesprek (telefoonnummer)
 * @param metaData - De lead data vanuit het Meta formulier
 * @returns De begroetingstekst (met eerste kwalificatievraag)
 */
export async function startConversationWithLeadData(
  tenantId: string,
  conversationId: string,
  metaData: MetaLeadData
): Promise<string> {
  // Zoek de tenant op voor de juiste agent-naam, bedrijfsnaam en eerste vraag
  const tenant = tenantStore.get(tenantId);
  if (!tenant) {
    console.error(`[Agent] Tenant niet gevonden: ${tenantId}`);
    return "Sorry, er is een configuratiefout opgetreden.";
  }

  // Maak het gesprek aan met de pre-filled data vanuit Meta
  // Dit slaat meteen naam, telefoon, email, bedrijf en website op
  store.startConversationWithLeadData(conversationId, tenantId, metaData);

  // Pak de eerste kwalificatievraag van de tenant
  // Dit is de eerste EXTRA vraag die we stellen (basisinfo weten we al)
  const eersteVraag = tenant.qualificationQuestions.length > 0
    ? tenant.qualificationQuestions[0]
    : "Hoe kunnen we je het beste helpen?";

  // Bouw een persoonlijke begroeting die de lead bij naam aanspreekt
  // en DIRECT de eerste kwalificatievraag stelt (efficiënt, geen tijdverspilling)
  const greeting = `Hoi ${metaData.naam}! Bedankt voor je interesse in ${tenant.businessName}. Ik ben ${tenant.agentName}, leuk je te spreken! 😊\n\nIk heb een paar korte vragen om te kijken hoe we je kunnen helpen. ${eersteVraag}`;

  // Sla de begroeting op als eerste bericht in het gesprek
  store.addMessage(conversationId, "agent", greeting, tenantId);

  // Log de nieuwe Meta-lead
  console.log(`[Agent] Meta lead gesprek gestart voor ${metaData.naam} (${conversationId}) bij ${tenant.businessName}`);

  return greeting;
}

/**
 * Extraheer gestructureerde lead-informatie uit een gesprek.
 *
 * Dit is een SLIM trucje: we sturen het hele gesprek naar Claude met de vraag:
 * "Welke informatie kun je uit dit gesprek halen?"
 * Claude leest het gesprek en stuurt een JSON-object terug met alle gevonden info.
 *
 * We doen dit pas na minimaal 4 berichten (2 uitwisselingen),
 * want eerder is er waarschijnlijk nog niet genoeg info om te extraheren.
 *
 * NIEUW: We vragen nu ook om 'website' te extraheren als dat in het gesprek voorkomt.
 *
 * @param tenant - De tenant (nodig voor de API-sleutel)
 * @param conversationId - Het gesprek waaruit we info willen halen
 */
async function extractLeadInfo(tenant: Tenant, conversationId: string): Promise<void> {
  const conv = store.get(conversationId);

  // Minimaal 4 berichten nodig (2 van lead + 2 van agent = 2 uitwisselingen)
  if (!conv || conv.messages.length < 4) return;

  try {
    const anthropic = getAnthropicClient(tenant);

    // Stuur het gesprek naar Claude met specifieke extractie-instructies
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      system:
        "Extraheer lead informatie uit het gesprek. Geef een JSON object terug met de velden die je kunt vinden: naam, bedrijf, website, branche, huidgeMarketing, gewenstKlanten (number), budget (number), eerdereAds (boolean), telefoon, email. Geef ALLEEN het JSON object terug, geen tekst.",
      messages: [
        {
          role: "user",
          // Zet alle berichten om naar leesbare tekst: "lead: bericht" of "agent: bericht"
          content: conv.messages.map((m) => `${m.role}: ${m.content}`).join("\n"),
        },
      ],
    });

    // Haal de tekst uit het antwoord
    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Zoek naar een JSON-object in de tekst (alles tussen { en })
    const jsonMatch = text.match(/\{.*\}/s);
    if (jsonMatch) {
      // Parse het JSON en werk de lead-informatie bij
      // We mergen dit met bestaande info zodat pre-filled data NIET verloren gaat
      const info: Partial<LeadInfo> = JSON.parse(jsonMatch[0]);
      store.updateLeadInfo(conversationId, info, conv.tenantId);
    }
  } catch {
    // Extractie mislukt? Geen probleem — we proberen het bij het volgende bericht opnieuw
    // Dit kan gebeuren als de API even niet beschikbaar is
  }
}

/**
 * Haal één specifiek gesprek op.
 * Handig voor de API (bijv. GET /conversations/:id)
 */
export function getConversation(conversationId: string) {
  return store.get(conversationId);
}

/**
 * Haal ALLE gesprekken op van alle tenants.
 * Wordt gebruikt voor het overzicht op het dashboard.
 */
export function getAllConversations() {
  return store.listAll();
}

/**
 * Haal alle gesprekken op die bij een specifieke tenant horen.
 * Elke tenant ziet alleen zijn eigen gesprekken.
 */
export function getConversationsByTenant(tenantId: string) {
  return store.listByTenant(tenantId);
}
