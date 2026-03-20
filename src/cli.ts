/**
 * CLI Interface (Command Line Interface — Opdrachtregel-interface)
 *
 * Dit bestand laat je de appointment setter TESTEN in je terminal,
 * zonder dat je WhatsApp of Twilio nodig hebt.
 *
 * HOE GEBRUIK JE HET?
 * 1. Start met: npm run cli
 * 2. Type een bericht als "lead" (potentiële klant)
 * 3. De AI-agent antwoordt
 * 4. Type /info om te zien welke informatie de agent heeft verzameld
 * 5. Type /quit om te stoppen
 *
 * MULTI-TENANT: De CLI gebruikt de eerste beschikbare tenant als configuratie.
 * Als er geen tenants zijn, vraagt het je om eerst 'npm run seed' te draaien.
 */

import * as readline from "readline"; // readline is een ingebouwde Node.js module voor terminal-invoer
import { handleMessage, startConversation, getConversation, tenantStore } from "./agent";

/**
 * Maak een readline-interface aan.
 * Dit verbindt de standaard invoer (toetsenbord) met de standaard uitvoer (terminal).
 * Zo kunnen we vragen stellen en antwoorden lezen in de terminal.
 */
const rl = readline.createInterface({
  input: process.stdin, // Lees van het toetsenbord
  output: process.stdout, // Schrijf naar het scherm
});

/**
 * Maak een uniek gesprek-ID aan op basis van de huidige tijd.
 * Date.now() geeft het aantal milliseconden sinds 1 januari 1970.
 * Dit zorgt ervoor dat elk testgesprek een uniek ID heeft.
 */
const CONVERSATION_ID = `test-${Date.now()}`;

/**
 * Druk een bericht van de agent af in CYAAN (lichtblauw) kleur.
 * De \x1b[36m code is een "ANSI escape code" — een speciale code die de
 * terminal vertelt om de tekstkleur te veranderen.
 * \x1b[0m zet de kleur weer terug naar normaal.
 */
function printAgent(agentName: string, message: string): void {
  console.log(`\n\x1b[36m[${agentName}]\x1b[0m ${message}\n`);
}

/**
 * Druk informatie af in GEEL kleur.
 * Gebruikt voor systeemberichten en instructies.
 */
function printInfo(message: string): void {
  console.log(`\x1b[33m${message}\x1b[0m`);
}

/**
 * Toon de verzamelde lead-informatie in MAGENTA (paars) kleur.
 * Dit laat zien wat de agent tot nu toe over de lead heeft geleerd.
 */
function printLeadInfo(): void {
  const conv = getConversation(CONVERSATION_ID);
  if (!conv) return;

  console.log("\n\x1b[35m--- Lead Info ---\x1b[0m");
  console.log(`Status: ${conv.status}`);
  console.log(`Score: ${conv.score}/100`);
  // Toon alleen de velden die al zijn ingevuld
  if (conv.leadInfo.naam) console.log(`Naam: ${conv.leadInfo.naam}`);
  if (conv.leadInfo.bedrijf) console.log(`Bedrijf: ${conv.leadInfo.bedrijf}`);
  if (conv.leadInfo.branche) console.log(`Branche: ${conv.leadInfo.branche}`);
  if (conv.leadInfo.budget) console.log(`Budget: ${conv.leadInfo.budget} euro`);
  console.log("\x1b[35m-----------------\x1b[0m\n");
}

/**
 * De hoofdfunctie — start de CLI-interface.
 * 'async' betekent dat deze functie asynchrone operaties kan doen (await gebruiken).
 * Dit is nodig omdat de AI-agent-aanroepen even duren (netwerk-verzoeken).
 */
async function main() {
  // Zoek de eerste beschikbare tenant om mee te testen
  const tenants = tenantStore.getAll();

  if (tenants.length === 0) {
    // Geen tenants gevonden — de gebruiker moet eerst de seed draaien
    printInfo("Geen tenants gevonden! Draai eerst: npx ts-node src/seed.ts");
    printInfo("Dit maakt een standaard tenant aan om mee te testen.");
    rl.close();
    return;
  }

  // Gebruik de eerste tenant als test-tenant
  const tenant = tenants[0];
  const tenantId = tenant.id;

  printInfo("=== Bureau-Assist AI Appointment Setter ===");
  printInfo(`Tenant: ${tenant.businessName} (${tenant.id})`);
  printInfo(`Agent: ${tenant.agentName}`);
  printInfo("Type een bericht als lead. Type '/info' voor lead info, '/quit' om te stoppen.\n");

  // Start het gesprek — de agent stuurt een begroeting
  const greeting = await startConversation(tenantId, CONVERSATION_ID);
  printAgent(tenant.agentName, greeting);

  /**
   * Vraag om invoer van de gebruiker.
   * Dit is een recursieve functie: na elk antwoord roept het zichzelf weer aan.
   * Zo blijft het programma vragen stellen tot de gebruiker /quit typt.
   */
  const askQuestion = () => {
    // De prompt "[Jij] " wordt in GROEN weergegeven
    rl.question("\x1b[32m[Jij]\x1b[0m ", async (input) => {
      const trimmed = input.trim(); // Verwijder spaties aan het begin en eind

      // /quit commando: stop het gesprek
      if (trimmed === "/quit") {
        printInfo("Gesprek beeindigd.");
        printLeadInfo(); // Toon de verzamelde lead-info als afscheid
        rl.close(); // Sluit de readline-interface (stopt het programma)
        return;
      }

      // /info commando: toon de verzamelde informatie
      if (trimmed === "/info") {
        printLeadInfo();
        askQuestion(); // Vraag opnieuw om invoer
        return;
      }

      // Lege invoer: negeer en vraag opnieuw
      if (!trimmed) {
        askQuestion();
        return;
      }

      try {
        // Stuur het bericht naar de AI-agent en wacht op het antwoord
        const reply = await handleMessage(tenantId, CONVERSATION_ID, trimmed);
        printAgent(tenant.agentName, reply);
      } catch (error) {
        console.error("Fout:", error);
      }

      // Check of het gesprek is afgelopen (status is niet meer "actief")
      const conv = getConversation(CONVERSATION_ID);
      if (conv && conv.status !== "actief") {
        printInfo(`\nConversatie status: ${conv.status} (score: ${conv.score}/100)`);
        printLeadInfo();
      }

      // Vraag opnieuw om invoer (de "loop" gaat door)
      askQuestion();
    });
  };

  // Start de eerste vraag
  askQuestion();
}

// Start de hoofdfunctie en vang eventuele fouten op
main().catch(console.error);
