/**
 * Tenant Systeem (Multi-tenant beheer)
 *
 * Dit bestand regelt het "multi-tenant" systeem. Dat betekent dat meerdere klanten
 * (tenants) dezelfde applicatie kunnen gebruiken, elk met hun eigen instellingen.
 *
 * Stel je voor: Bureau-Assist is de app, maar klant A (een fitnessstudio) en
 * klant B (een consultancybureau) gebruiken allebei dezelfde app. Elke klant
 * heeft eigen API-sleutels, eigen vragen, eigen telefoonnummer, etc.
 *
 * We slaan alle tenant-gegevens op in een JSON-bestand (data/tenants.json).
 * In een echte productie-app zou je hiervoor een database gebruiken.
 */

import fs from "fs"; // 'fs' is de ingebouwde Node.js module om bestanden te lezen/schrijven
import path from "path"; // 'path' helpt met het samenstellen van bestandspaden (werkt op elk besturingssysteem)

/**
 * Het pad naar het JSON-bestand waar we alle tenants opslaan.
 * __dirname = de map waar dit bestand (tenant.ts) zich bevindt (src/)
 * We gaan twee mappen omhoog (..) en dan naar data/tenants.json
 */
const TENANTS_FILE = path.join(__dirname, "..", "data", "tenants.json");

/**
 * Tenant Interface
 *
 * Een "interface" in TypeScript beschrijft de VORM van een object.
 * Het zegt: "elk Tenant-object MOET deze velden hebben."
 * Dit helpt ons om fouten te voorkomen — als je een veld vergeet,
 * geeft TypeScript een foutmelding VOORDAT je code draait.
 */
export interface Tenant {
  /** Unieke identificatie voor deze tenant (bijv. "bureau-assist") */
  id: string;

  /** De naam van het bedrijf van deze klant (bijv. "Bureau-Assist") */
  businessName: string;

  /** De naam die de AI-agent gebruikt (bijv. "Lisa") */
  agentName: string;

  /** De toon/stijl van de agent (bijv. "Vriendelijk en professioneel") */
  agentTone: string;

  /** Lijst van kwalificatievragen die de agent stelt aan leads */
  qualificationQuestions: string[];

  /** Minimaal budget in euro's — leads met minder budget worden niet gekwalificeerd */
  minBudget: number;

  /** Branches/industrieën waar deze tenant zich op richt */
  idealIndustries: string[];

  /** URL waar gekwalificeerde leads een afspraak kunnen boeken */
  bookingUrl: string;

  /** API-sleutel voor Anthropic (Claude AI) — elke tenant kan zijn eigen sleutel hebben */
  anthropicApiKey: string;

  /** Twilio Account SID — nodig om WhatsApp-berichten te sturen */
  twilioAccountSid: string;

  /** Twilio Auth Token — het "wachtwoord" voor de Twilio API */
  twilioAuthToken: string;

  /** Het WhatsApp-telefoonnummer van deze tenant (bijv. "whatsapp:+31612345678") */
  twilioPhoneNumber: string;

  /** Geheim wachtwoord om webhook-verzoeken te verifiëren (optioneel) */
  webhookSecret: string;

  /** Datum wanneer deze tenant is aangemaakt */
  createdAt: string;

  /** Datum van de laatste wijziging */
  updatedAt: string;
}

/**
 * TenantStore Klasse
 *
 * Een "klasse" (class) is een blauwdruk voor het maken van objecten.
 * Deze klasse beheert ALLE tenants: toevoegen, ophalen, wijzigen, verwijderen.
 *
 * We laden de tenants uit een JSON-bestand bij het opstarten,
 * en slaan wijzigingen meteen op naar dat bestand.
 */
export class TenantStore {
  /**
   * Een Map (woordenboek) dat tenant-ID's koppelt aan Tenant-objecten.
   * Map is sneller dan een array als je vaak op ID wilt zoeken.
   * 'private' betekent: alleen deze klasse kan er direct bij.
   */
  private tenants: Map<string, Tenant> = new Map();

  /**
   * Constructor — wordt automatisch aangeroepen als je "new TenantStore()" doet.
   * We laden hier meteen alle bestaande tenants uit het JSON-bestand.
   */
  constructor() {
    this.loadFromFile();
  }

  /**
   * Laad tenants uit het JSON-bestand op de harde schijf.
   * Als het bestand niet bestaat, beginnen we gewoon met een lege lijst.
   */
  private loadFromFile(): void {
    try {
      // Controleer of het bestand bestaat voordat we het proberen te lezen
      if (fs.existsSync(TENANTS_FILE)) {
        // Lees het bestand als tekst (UTF-8 is de standaard tekencodering)
        const data = fs.readFileSync(TENANTS_FILE, "utf-8");
        // Zet de JSON-tekst om naar een JavaScript array van Tenant-objecten
        const tenantsArray: Tenant[] = JSON.parse(data);
        // Vul onze Map met elk tenant-object (ID als sleutel)
        for (const tenant of tenantsArray) {
          this.tenants.set(tenant.id, tenant);
        }
        console.log(`[Tenant] ${this.tenants.size} tenant(s) geladen uit bestand`);
      }
    } catch (error) {
      // Als er iets misgaat (bijv. corrupt bestand), loggen we de fout
      // maar laten we de app niet crashen
      console.error("[Tenant] Fout bij laden van tenants:", error);
    }
  }

  /**
   * Sla alle tenants op naar het JSON-bestand.
   * We doen dit na ELKE wijziging zodat gegevens niet verloren gaan
   * als de server herstart.
   */
  private saveToFile(): void {
    try {
      // Maak de map aan als die nog niet bestaat (recursive: true = maak ook ouder-mappen)
      const dir = path.dirname(TENANTS_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Zet onze Map om naar een array en dan naar mooie JSON-tekst
      // JSON.stringify met 2 spaties maakt het bestand leesbaar voor mensen
      const data = JSON.stringify(Array.from(this.tenants.values()), null, 2);
      fs.writeFileSync(TENANTS_FILE, data, "utf-8");
    } catch (error) {
      console.error("[Tenant] Fout bij opslaan van tenants:", error);
    }
  }

  /**
   * Haal alle tenants op als een array.
   * Array.from() zet de Map-waarden om naar een gewone array.
   */
  getAll(): Tenant[] {
    return Array.from(this.tenants.values());
  }

  /**
   * Zoek een specifieke tenant op basis van zijn ID.
   * Geeft 'undefined' terug als de tenant niet bestaat.
   */
  get(id: string): Tenant | undefined {
    return this.tenants.get(id);
  }

  /**
   * Zoek een tenant op basis van zijn Twilio telefoonnummer.
   * Dit gebruiken we als er een WhatsApp-bericht binnenkomt:
   * we kijken naar welk nummer het gestuurd is, en zoeken de bijbehorende tenant.
   *
   * Array.from().find() doorzoekt alle tenants tot er eentje matcht.
   */
  getByPhoneNumber(phoneNumber: string): Tenant | undefined {
    return Array.from(this.tenants.values()).find(
      (t) => t.twilioPhoneNumber === phoneNumber
    );
  }

  /**
   * Maak een nieuwe tenant aan.
   * 'Omit<Tenant, "createdAt" | "updatedAt">' betekent:
   * we verwachten alle Tenant-velden BEHALVE createdAt en updatedAt,
   * want die vullen we hier zelf in.
   */
  create(data: Omit<Tenant, "createdAt" | "updatedAt">): Tenant {
    // Maak het volledige tenant-object met automatische datums
    const tenant: Tenant = {
      ...data, // Kopieer alle meegegeven velden (spread operator)
      createdAt: new Date().toISOString(), // Huidige datum/tijd in ISO formaat
      updatedAt: new Date().toISOString(),
    };

    // Sla op in het geheugen (Map) en op de harde schijf (JSON)
    this.tenants.set(tenant.id, tenant);
    this.saveToFile();

    console.log(`[Tenant] Nieuwe tenant aangemaakt: ${tenant.businessName} (${tenant.id})`);
    return tenant;
  }

  /**
   * Werk een bestaande tenant bij met nieuwe gegevens.
   * 'Partial<Tenant>' betekent: je hoeft niet ALLE velden mee te geven,
   * alleen de velden die je wilt wijzigen.
   *
   * Geeft de bijgewerkte tenant terug, of undefined als de tenant niet bestaat.
   */
  update(id: string, data: Partial<Tenant>): Tenant | undefined {
    const existing = this.tenants.get(id);
    if (!existing) return undefined; // Tenant bestaat niet — niets te updaten

    // Voeg de nieuwe gegevens samen met de bestaande (spread operator)
    // De nieuwe velden overschrijven de oude, maar ongewijzigde velden blijven behouden
    const updated: Tenant = {
      ...existing,
      ...data,
      id: existing.id, // ID mag NOOIT veranderen (we forceren de originele waarde)
      createdAt: existing.createdAt, // Aanmaakdatum mag ook niet veranderen
      updatedAt: new Date().toISOString(), // Werk de "laatst bijgewerkt" datum bij
    };

    this.tenants.set(id, updated);
    this.saveToFile();

    console.log(`[Tenant] Tenant bijgewerkt: ${updated.businessName} (${id})`);
    return updated;
  }

  /**
   * Verwijder een tenant op basis van zijn ID.
   * Geeft true terug als de tenant bestond en is verwijderd,
   * of false als de tenant niet gevonden werd.
   */
  delete(id: string): boolean {
    const existed = this.tenants.delete(id); // Map.delete() geeft true/false terug
    if (existed) {
      this.saveToFile(); // Sla de wijziging op
      console.log(`[Tenant] Tenant verwijderd: ${id}`);
    }
    return existed;
  }
}
