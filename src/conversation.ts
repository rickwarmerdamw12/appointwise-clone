/**
 * Conversation Memory (Gespreksgeheugen)
 *
 * Dit bestand beheert ALLE gesprekken die de bot voert met leads.
 * Elk gesprek wordt opgeslagen in het geheugen van de server (RAM).
 *
 * BELANGRIJK: Als de server herstart, zijn alle gesprekken WEG.
 * In een echte productie-app zou je een database gebruiken (bijv. PostgreSQL).
 *
 * MULTI-TENANT: Elk gesprek hoort nu bij een specifieke tenant (klant).
 * Zo weten we welke gesprekken bij welke klant horen.
 *
 * NIEUW: Pre-filled lead data vanuit Meta lead forms.
 * Leads die binnenkomen via Meta advertenties hebben al basisinfo ingevuld:
 * naam, telefoon, email, bedrijfsnaam en website. De bot hoeft deze info
 * NIET meer te vragen en kan direct starten met kwalificatievragen.
 */

/**
 * Message Interface — Eén enkel bericht in een gesprek.
 *
 * Een gesprek bestaat uit een lijst van Message-objecten.
 * Elk bericht heeft een afzender (lead of agent), de tekst, en een tijdstip.
 *
 * Voorbeeld:
 * { role: "lead", content: "Hallo!", timestamp: new Date() }
 * { role: "agent", content: "Hoi! Ik ben Lisa.", timestamp: new Date() }
 */
export interface Message {
  /** Wie heeft dit bericht gestuurd? "lead" = de potentiële klant, "agent" = onze AI-bot */
  role: "lead" | "agent";

  /** De daadwerkelijke tekst van het bericht */
  content: string;

  /** Wanneer is dit bericht verstuurd? */
  timestamp: Date;
}

/**
 * LeadInfo Interface — Informatie die we verzamelen over de lead.
 *
 * Sommige velden worden PRE-FILLED vanuit het Meta lead formulier:
 * - naam, telefoon, email, bedrijf, website (deze weten we AL bij de start)
 *
 * Andere velden worden verzameld via de kwalificatievragen:
 * - branche, huidgeMarketing, gewenstKlanten, budget, eerdereAds
 *
 * Het vraagteken (?) achter elk veld betekent: dit veld is OPTIONEEL.
 * We hebben deze info pas als de lead het vertelt (of als het vanuit Meta komt).
 */
export interface LeadInfo {
  /** De naam van de contactpersoon (PRE-FILLED vanuit Meta lead form) */
  naam?: string;

  /** De naam van het bedrijf (PRE-FILLED vanuit Meta lead form) */
  bedrijf?: string;

  /** De website van het bedrijf (PRE-FILLED vanuit Meta lead form) */
  website?: string;

  /** In welke branche/sector zit het bedrijf? (bijv. "coaching", "fitness") */
  branche?: string;

  /** Hoe werft het bedrijf nu klanten? (bijv. "mond-tot-mond", "Google Ads") */
  huidgeMarketing?: string;

  /** Hoeveel nieuwe klanten wil het bedrijf per maand? */
  gewenstKlanten?: number;

  /** Wat is het marketingbudget per maand in euro's? */
  budget?: number;

  /** Heeft het bedrijf eerder met online advertenties gewerkt? */
  eerdereAds?: boolean;

  /** Telefoonnummer van de lead (PRE-FILLED vanuit Meta lead form) */
  telefoon?: string;

  /** E-mailadres van de lead (PRE-FILLED vanuit Meta lead form) */
  email?: string;
}

/**
 * MetaLeadData Interface — Data die binnenkomt vanuit een Meta (Facebook/Instagram) lead form.
 *
 * Wanneer iemand op een Meta advertentie klikt en het formulier invult,
 * stuurt Meta deze gegevens naar onze webhook. Dit zijn de BEKENDE gegevens
 * waarmee we het gesprek starten — de bot hoeft deze NIET meer te vragen.
 *
 * FLOW:
 * 1. Lead ziet advertentie op Facebook/Instagram
 * 2. Lead klikt en vult formulier in (naam, email, telefoon, bedrijf, website)
 * 3. Meta stuurt deze data naar onze /webhook/meta endpoint
 * 4. Wij starten een WhatsApp-gesprek met deze pre-filled data
 * 5. De bot vraagt alleen nog de EXTRA kwalificatievragen
 */
export interface MetaLeadData {
  /** De volledige naam van de lead (bijv. "Jan de Vries") */
  naam: string;

  /** Het telefoonnummer van de lead (bijv. "+31612345678") */
  telefoon: string;

  /** Het e-mailadres van de lead (bijv. "jan@bedrijf.nl") */
  email: string;

  /** De naam van het bedrijf (bijv. "De Vries Coaching") */
  bedrijf: string;

  /** De website URL van het bedrijf (bijv. "https://devries-coaching.nl") */
  website: string;
}

/**
 * Conversation Interface — Eén volledig gesprek met een lead.
 *
 * Dit object bevat ALLES over één gesprek: wie de lead is, wat er gezegd is,
 * of de lead gekwalificeerd is, en welke score ze hebben gekregen.
 *
 * Het 'metaLeadData' veld is NIEUW: hierin slaan we de originele data
 * op die vanuit het Meta lead formulier is binnengekomen. Zo weten we
 * altijd dat dit een lead is die via een advertentie is binnengekomen.
 */
export interface Conversation {
  /** Unieke ID van het gesprek (vaak het telefoonnummer van de lead) */
  id: string;

  /** De ID van de tenant (klant) waar dit gesprek bij hoort */
  tenantId: string;

  /** Alle verzamelde informatie over de lead (zowel pre-filled als via vragen) */
  leadInfo: LeadInfo;

  /** Alle berichten in chronologische volgorde */
  messages: Message[];

  /**
   * De huidige status van het gesprek:
   * - "actief": gesprek is nog bezig (bot stelt kwalificatievragen)
   * - "gekwalificeerd": lead is geschikt, afspraak kan gemaakt worden
   * - "niet_gekwalificeerd": lead past niet bij ons aanbod
   * - "afspraak_gepland": er is een afspraak ingepland!
   */
  status: "actief" | "gekwalificeerd" | "niet_gekwalificeerd" | "afspraak_gepland";

  /** Kwalificatiescore van 0-100 (hoe hoger, hoe beter de lead past) */
  score: number;

  /**
   * Optioneel: de originele data vanuit het Meta lead formulier.
   * Als dit veld is ingevuld, weten we dat de lead via een Meta advertentie is binnengekomen.
   * Dit is handig voor tracking en om te weten welke velden al bekend zijn.
   */
  metaLeadData?: MetaLeadData;

  /** Wanneer is dit gesprek gestart? */
  createdAt: Date;

  /** Wanneer is dit gesprek voor het laatst bijgewerkt? */
  updatedAt: Date;
}

/**
 * ConversationStore Klasse — Beheert alle gesprekken in het geheugen.
 *
 * Dit is als een "digitaal archief" van alle gesprekken.
 * Je kunt gesprekken aanmaken, ophalen, bijwerken, en filteren per tenant.
 *
 * We gebruiken een Map (woordenboek) voor snelle opzoeking op ID.
 *
 * NIEUW: De methode startConversationWithLeadData() maakt een gesprek aan
 * met vooraf ingevulde lead-informatie vanuit het Meta lead formulier.
 */
export class ConversationStore {
  /**
   * Alle gesprekken opgeslagen in een Map.
   * De sleutel is het gesprek-ID, de waarde is het Conversation-object.
   * 'private' = alleen deze klasse kan er direct bij.
   */
  private conversations: Map<string, Conversation> = new Map();

  /**
   * Maak een nieuw gesprek aan voor een specifieke tenant.
   * Dit wordt aangeroepen als er een NIEUW telefoonnummer contact opneemt.
   *
   * @param id - Uniek ID voor het gesprek (vaak het telefoonnummer)
   * @param tenantId - De ID van de tenant waar dit gesprek bij hoort
   * @returns Het nieuw aangemaakte Conversation-object
   */
  create(id: string, tenantId: string): Conversation {
    const conv: Conversation = {
      id,
      tenantId, // Koppel het gesprek aan de juiste tenant
      leadInfo: {}, // Nog geen info over de lead — wordt later ingevuld
      messages: [], // Nog geen berichten — wordt gevuld tijdens het gesprek
      status: "actief", // Elk nieuw gesprek begint als "actief"
      score: 0, // Score begint op 0 — wordt hoger naarmate de lead beter past
      createdAt: new Date(), // Tijdstip van aanmaken
      updatedAt: new Date(), // Wordt bijgewerkt bij elke wijziging
    };

    // Sla het gesprek op in onze Map
    this.conversations.set(id, conv);
    return conv;
  }

  /**
   * Start een nieuw gesprek met PRE-FILLED lead data vanuit het Meta lead formulier.
   *
   * Dit is de NIEUWE manier om gesprekken te starten voor leads die via Meta advertenties
   * binnenkomen. In plaats van een leeg gesprek te starten, vullen we meteen de
   * bekende informatie in (naam, telefoon, email, bedrijf, website).
   *
   * WAAROM IS DIT BELANGRIJK?
   * - De bot hoeft de basisvragen NIET meer te stellen (scheelt 5 berichten!)
   * - Het gesprek voelt persoonlijker (de bot kent je naam al)
   * - De kwalificatie gaat sneller (direct naar de echte vragen)
   *
   * @param id - Uniek ID voor het gesprek (meestal het telefoonnummer van de lead)
   * @param tenantId - De ID van de tenant (klant) die deze lead ontvangt
   * @param metaData - De data die uit het Meta lead formulier komt (naam, telefoon, etc.)
   * @returns Het nieuw aangemaakte Conversation-object met pre-filled data
   *
   * Voorbeeld gebruik:
   * const conv = store.startConversationWithLeadData(
   *   "+31612345678",
   *   "bureau-assist",
   *   { naam: "Jan", telefoon: "+31612345678", email: "jan@test.nl", bedrijf: "Jan BV", website: "jan.nl" }
   * );
   */
  startConversationWithLeadData(id: string, tenantId: string, metaData: MetaLeadData): Conversation {
    // Maak een nieuw gesprek aan met de bekende lead-informatie al ingevuld
    const conv: Conversation = {
      id,
      tenantId,
      // Vul de leadInfo direct in met de data uit het Meta formulier
      // Zo weet de agent meteen wie de lead is zonder het te hoeven vragen
      leadInfo: {
        naam: metaData.naam,         // De naam van de lead (bijv. "Jan de Vries")
        telefoon: metaData.telefoon, // Het telefoonnummer (bijv. "+31612345678")
        email: metaData.email,       // Het e-mailadres (bijv. "jan@bedrijf.nl")
        bedrijf: metaData.bedrijf,   // De bedrijfsnaam (bijv. "De Vries Coaching")
        website: metaData.website,   // De website (bijv. "https://devries-coaching.nl")
      },
      messages: [], // Nog geen berichten — de begroeting komt via de agent
      status: "actief", // Het gesprek is nu actief (kwalificatie start)
      score: 0, // Score begint op 0 — wordt bepaald na de kwalificatievragen
      metaLeadData: metaData, // Bewaar de originele Meta-data voor referentie
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Sla het gesprek op in de Map
    this.conversations.set(id, conv);

    // Log dat er een nieuw gesprek is gestart met Meta-data
    console.log(`[Conversation] Nieuw gesprek gestart met Meta lead data: ${metaData.naam} (${id})`);

    return conv;
  }

  /**
   * Haal een bestaand gesprek op via zijn ID.
   * Geeft 'undefined' terug als het gesprek niet bestaat.
   */
  get(id: string): Conversation | undefined {
    return this.conversations.get(id);
  }

  /**
   * Haal een gesprek op, of maak een nieuw gesprek aan als het nog niet bestaat.
   * Dit is een "veilige" manier om altijd een geldig gesprek terug te krijgen.
   *
   * @param id - Het gesprek-ID
   * @param tenantId - De tenant-ID (nodig als er een nieuw gesprek aangemaakt moet worden)
   */
  getOrCreate(id: string, tenantId: string): Conversation {
    return this.get(id) || this.create(id, tenantId);
  }

  /**
   * Voeg een nieuw bericht toe aan een gesprek.
   * Dit wordt aangeroepen voor ELK bericht — zowel van de lead als van de agent.
   *
   * @param id - Het gesprek-ID
   * @param role - Wie stuurt het bericht? ("lead" of "agent")
   * @param content - De tekst van het bericht
   * @param tenantId - De tenant-ID (voor het geval het gesprek nog niet bestaat)
   */
  addMessage(id: string, role: "lead" | "agent", content: string, tenantId: string): void {
    // Haal het gesprek op (of maak het aan als het nog niet bestaat)
    const conv = this.getOrCreate(id, tenantId);

    // Voeg het bericht toe aan de lijst met berichten
    conv.messages.push({ role, content, timestamp: new Date() });

    // Werk de "laatst bijgewerkt" datum bij
    conv.updatedAt = new Date();
  }

  /**
   * Werk de lead-informatie bij met nieuwe gegevens.
   * Partial<LeadInfo> betekent: je hoeft niet alle velden in te vullen,
   * alleen de nieuwe/gewijzigde velden.
   *
   * De spread operator (...) zorgt ervoor dat bestaande info NIET verloren gaat.
   * Nieuwe waarden overschrijven oude waarden, maar velden die niet meegegeven worden
   * blijven ongewijzigd.
   */
  updateLeadInfo(id: string, info: Partial<LeadInfo>, tenantId: string): void {
    const conv = this.getOrCreate(id, tenantId);
    // Voeg nieuwe info samen met bestaande info (bestaande waarden worden overschreven)
    conv.leadInfo = { ...conv.leadInfo, ...info };
    conv.updatedAt = new Date();
  }

  /**
   * Werk de status van een gesprek bij.
   * Bijv. van "actief" naar "gekwalificeerd" als de lead geschikt is.
   *
   * Mogelijke status-overgangen:
   * actief -> gekwalificeerd (lead past bij ons)
   * actief -> niet_gekwalificeerd (lead past niet)
   * gekwalificeerd -> afspraak_gepland (lead heeft afspraak geboekt)
   */
  updateStatus(id: string, status: Conversation["status"], tenantId: string): void {
    const conv = this.getOrCreate(id, tenantId);
    conv.status = status;
    conv.updatedAt = new Date();
  }

  /**
   * Werk de kwalificatiescore bij (0-100).
   * De AI-agent bepaalt deze score op basis van de antwoorden van de lead.
   *
   * Score-indicatie:
   * 0-30:  Waarschijnlijk niet geschikt
   * 30-60: Misschien geschikt, meer info nodig
   * 60-80: Goede match
   * 80-100: Uitstekende match, hoge prioriteit
   */
  updateScore(id: string, score: number, tenantId: string): void {
    const conv = this.getOrCreate(id, tenantId);
    conv.score = score;
    conv.updatedAt = new Date();
  }

  /**
   * Haal alle berichten op van een specifiek gesprek.
   * Geeft een lege array terug als het gesprek niet bestaat.
   */
  getHistory(id: string): Message[] {
    return this.get(id)?.messages || [];
  }

  /**
   * Haal alle ACTIEVE gesprekken op (status = "actief").
   * Handig om te zien hoeveel gesprekken er nu gaande zijn.
   */
  listActive(): Conversation[] {
    return Array.from(this.conversations.values()).filter(
      (c) => c.status === "actief"
    );
  }

  /**
   * Haal ALLE gesprekken op, ongeacht status.
   */
  listAll(): Conversation[] {
    return Array.from(this.conversations.values());
  }

  /**
   * Haal alle gesprekken op die bij een specifieke tenant horen.
   * Dit is essentieel voor het multi-tenant systeem:
   * elke klant ziet alleen ZIJN EIGEN gesprekken.
   *
   * @param tenantId - De tenant-ID om op te filteren
   */
  listByTenant(tenantId: string): Conversation[] {
    return Array.from(this.conversations.values()).filter(
      (c) => c.tenantId === tenantId
    );
  }
}
