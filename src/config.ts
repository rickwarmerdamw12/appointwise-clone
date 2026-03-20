/**
 * Configuratie (Instellingen)
 *
 * Dit bestand laadt alle instellingen uit het .env bestand.
 *
 * WAT IS EEN .ENV BESTAND?
 * Een .env bestand bevat "omgevingsvariabelen" — geheime waarden zoals
 * API-sleutels en wachtwoorden die je NIET in je code wilt zetten.
 * Je code leest deze waarden via process.env.NAAM_VAN_VARIABELE.
 *
 * WAAROM NIET IN DE CODE?
 * Als je API-sleutels in je code zet en die naar GitHub pusht,
 * kan iedereen je sleutels zien en misbruiken. Daarom zetten we ze
 * in een .env bestand dat we NIET naar GitHub sturen (.gitignore).
 *
 * LET OP: Dit config-bestand wordt nu voornamelijk gebruikt voor de server-poort
 * en als fallback. De meeste instellingen zitten nu per tenant in tenant.ts.
 */

import dotenv from "dotenv"; // dotenv leest het .env bestand en zet de waarden in process.env

// Laad het .env bestand in. Vanaf nu zijn alle variabelen beschikbaar via process.env
dotenv.config();

/**
 * Het config-object met alle instellingen.
 *
 * process.env.IETS leest de waarde van variabele IETS uit het .env bestand.
 * De || "standaardwaarde" zorgt ervoor dat er altijd een waarde is,
 * ook als de variabele niet is ingesteld.
 */
export const config = {
  /** De poort waarop onze webserver draait (standaard 3000) */
  port: parseInt(process.env.PORT || "3000", 10),
  // parseInt zet de tekst "3000" om naar het getal 3000
  // De 10 aan het eind betekent: gebruik het decimale talstelsel (base 10)
};
