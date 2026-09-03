/**
 * English dictionary — the source of truth for the shape of every other locale.
 *
 * `type Dictionary = typeof en`, and `bn.ts` is declared as `const bn: Dictionary`,
 * so a missing, extra, or wrongly-shaped key is a type error rather than a string
 * that silently falls back to English at runtime.
 *
 * Parameterized strings are functions, not templates with placeholders: the
 * argument list is part of the type, so a translation can reorder or re-case its
 * inputs freely and TypeScript still checks every call site.
 *
 * Note what is *not* here: bare prepositions and connectives ("of", "by", "in").
 * Composing a sentence from fragments works in English and falls apart in Bangla,
 * which is verb-final and postpositional — so every sentence is translated whole,
 * with its variables as function arguments.
 */
import { formatNumber, localizeDigits } from "@/lib/format";

/** Quantities inside a sentence: grouped and digit-scripted for this locale. */
const n = (x: number) => formatNumber(x, "en");

/** Bare digits — years, ordinals, anything that must not pick up separators. */
const d = (x: number | string) => localizeDigits(String(x), "en");

// English-only grammar helpers. They live here rather than in a shared module
// because they *are* English: articles and -s plurals are exactly the kind of
// thing another locale must not inherit.

/** "upazila" -> "an upazila", "district" -> "a district". */
const withArticle = (word: string) => `${/^[aeiou]/i.test(word) ? "an" : "a"} ${word}`;

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const plural = (count: number, word: string) => `${n(count)} ${word}${count === 1 ? "" : "s"}`;

export const en = {
  // ── <head> ───────────────────────────────────────────────────────────────
  meta: {
    title: "PlotGuard — Land Records & Dispute Resolution",
    /** Next.js title template; `%s` is the page's own title. */
    titleTemplate: "%s · PlotGuard",
    description:
      "A civic platform for secure land records, mutations, dispute resolution, and field surveys.",
  },

  // ── Cross-cutting vocabulary ─────────────────────────────────────────────
  common: {
    appName: "PlotGuard",
    tagline: "Land Registry",
    loading: "Loading…",
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    close: "Close",
    back: "Back",
    next: "Next",
    submit: "Submit",
    submitting: "Submitting…",
    confirm: "Confirm",
    edit: "Edit",
    delete: "Delete",
    remove: "Remove",
    view: "View",
    viewAll: "View all",
    search: "Search",
    filter: "Filter",
    clear: "Clear",
    all: "All",
    none: "None",
    yes: "Yes",
    no: "No",
    open: "Open",
    retry: "Retry",
    optional: "optional",
    required: "Required",
    notAvailable: "—",
    unknown: "Unknown",
    byteUnits: { b: "B", kb: "KB", mb: "MB" },
    somethingWentWrong: "Something went wrong",
    tryAgain: "Please try again.",
  },

  // ── Sidebar / topbar / menus ─────────────────────────────────────────────
  shell: {
    navigation: "Navigation",
    openNavigation: "Open navigation",
    searchRecords: "Search records",
    toggleTheme: "Toggle theme",
    language: "Language",
    changeLanguage: "Change language",
    accountMenu: "Account menu",
    signOut: "Sign out",
    notifications: "Notifications",
    notificationsAria: (unread: number) =>
      unread ? `Notifications, ${n(unread)} unread` : "Notifications",
    markAllRead: "Mark all read",
    allCaughtUp: "You're all caught up.",
  },

  // ── Sign-in ───────────────────────────────────────────────────────────────
  login: {
    tagline: "Sign in to your account",
    emailLabel: "Email",
    emailPlaceholder: "you@example.bd",
    passwordLabel: "Password",
    passwordPlaceholder: "••••••••",
    submit: "Sign in",
    submitting: "Signing in…",
    errorTitle: "We couldn't find that account",
    errorBody: "Check the email address, or pick one of the demo accounts below.",
    wrongPasswordTitle: "That password doesn't match",
    wrongPasswordBody: "Try the demo password below, or pick a demo account to fill both fields.",
    demoAccountsLabel: "Demo accounts",
    demoPasswordHint: "Demo password:",
  },

  // ── Portals and their sidebar entries ────────────────────────────────────
  nav: {
    portals: {
      citizen: "Citizen Portal",
      landOffice: "Land Office",
      fieldSurvey: "Field Survey",
      mediation: "Mediation",
      administration: "Administration",
    },
    /** Sidebar section headings. Only used where a portal groups its items. */
    groups: {
      myLand: "My land",
      services: "Services",
      tools: "Tools",
    },
    portal: "All services",
    dashboard: "Dashboard",
    myProperties: "My properties",
    searchRecords: "Search records",
    myDocuments: "My documents",
    disputes: "Disputes",
    inheritance: "Inheritance",
    records: "Records",
    mutations: "Mutations",
    landTax: "Land development tax",
    ocrQueue: "OCR queue",
    fraudReview: "Fraud review",
    fieldAgents: "Field agents",
    assignedVisits: "Assigned visits",
    cases: "Cases",
    users: "Users",
    auditLedger: "Audit ledger",
    jurisdictions: "Jurisdictions",
    policies: "Policies",
  },

  roles: {
    citizen: "Citizen",
    "land-office": "Land Office",
    "field-agent": "Field Agent",
    mediator: "Mediator",
    admin: "Administrator",
  },

  // ── Domain status labels (see lib/status.ts) ─────────────────────────────
  status: {
    registry: {
      verified: "Verified",
      pending: "Pending",
      disputed: "Disputed",
      flagged: "Flagged",
      "under-mutation": "Under mutation",
    },
    dispute: {
      submitted: "Submitted",
      "under-review": "Under review",
      "field-visit-scheduled": "Field visit scheduled",
      "in-mediation": "In mediation",
      "hearing-scheduled": "Hearing scheduled",
      resolved: "Resolved",
      rejected: "Rejected",
      withdrawn: "Withdrawn",
    },
    priority: {
      low: "Low",
      medium: "Medium",
      high: "High",
    },
    mutation: {
      submitted: "Submitted",
      verification: "In verification",
      "objection-period": "Objection period",
      approved: "Approved",
      rejected: "Rejected",
    },
    ocr: {
      pending: "Queued",
      processing: "Processing",
      extracted: "Extracted",
      failed: "Failed",
    },
    verification: {
      unverified: "Unverified",
      verified: "Verified",
      flagged: "Flagged",
      rejected: "Rejected",
    },
    fieldReport: {
      assigned: "Assigned",
      "en-route": "En route",
      "in-progress": "In progress",
      completed: "Completed",
      cancelled: "Cancelled",
    },
    hearing: {
      scheduled: "Scheduled",
      "in-hearing": "In hearing",
      deliberation: "Deliberation",
      ruled: "Ruled",
      appealed: "Appealed",
    },
    user: {
      active: "Active",
      suspended: "Suspended",
      invited: "Invited",
    },
  },

  // ── System-generated record text (see NotificationContent) ───────────────
  notifications: {
    "dispute-status": (caseNumber: string, status: string) => ({
      title: `Dispute moved to ${status}`,
      body: `Case ${caseNumber} was updated by the land office.`,
    }),
    "dispute-assigned": (caseNumber: string) => ({
      title: "New dispute assigned",
      body: `${caseNumber} requires review.`,
    }),
    "dispute-ruled": (caseNumber: string) => ({
      title: "Ruling issued",
      body: `A ruling has been issued on case ${caseNumber}. Open the case to read it.`,
    }),
    "hearing-scheduled": (caseNumber: string) => ({
      title: "Hearing scheduled",
      body: `Case ${caseNumber} has been listed for hearing by the mediator.`,
    }),
    "document-verified": (dagNo: string) => ({
      title: "Document verified",
      body: `Your khatian for dag ${dagNo} passed verification.`,
    }),
    "document-unclear": (dagNo: string) => ({
      title: "Action needed: scan unclear",
      body: `The affidavit for dag ${dagNo} needs a clearer re-scan before reading can continue.`,
    }),
    "document-processed": (fileName: string) => ({
      title: "Document processed",
      body: `Text was extracted from ${fileName}. It is now awaiting officer verification.`,
    }),
    "survey-scheduled": (dagNo: string) => ({
      title: "Field survey scheduled",
      body: `A boundary survey for dag ${dagNo} has been scheduled.`,
    }),
    "mutation-verification": (mutationNumber: string, dagNo: string) => ({
      title: "Namjari in verification",
      body: `Mutation ${mutationNumber} for dag ${dagNo} is being verified.`,
    }),
    welcome: () => ({
      title: "Welcome to PlotGuard",
      body: "Your account is active. You can now search records and track disputes.",
    }),
  },

  disputeEvents: {
    filed: "Dispute filed",
    assigned: (to: string) => `Assigned to ${to}`,
    "evidence-added": "Evidence added",
    "status-change": (status: string) => `Moved to ${status}`,
    "hearing-held": (ordinal: number) => `Hearing ${n(ordinal)} held`,
    "field-visit-scheduled": "Field visit scheduled",
    "field-visit-completed": "Field survey filed",
    ruled: "Ruling issued",
  },

  // ── Domain enums that appear as plain text, not badges ───────────────────
  domain: {
    jurisdictionLevel: {
      division: "Division",
      district: "District",
      upazila: "Upazila",
      mouza: "Mouza",
    },
    jurisdictionLevelPlural: {
      division: "Divisions",
      district: "Districts",
      upazila: "Upazilas",
      mouza: "Mouzas",
    },
    documentType: {
      "title-deed": "Title deed",
      "sale-deed": "Sale deed",
      "mutation-order": "Mutation order",
      "survey-report": "Survey report",
      "id-proof": "ID proof",
      "tax-receipt": "Tax receipt",
      "inheritance-affidavit": "Inheritance affidavit",
      "court-order": "Court order",
      photo: "Photo",
    },
    disputeType: {
      boundary: "Boundary",
      ownership: "Ownership",
      inheritance: "Inheritance",
      encroachment: "Encroachment",
      fraud: "Fraud",
      easement: "Easement",
    },
    surveyPurpose: {
      "boundary-survey": "Boundary survey",
      "encroachment-check": "Encroachment check",
      "possession-verify": "Possession verification",
      measurement: "Measurement",
    },
    partyRole: {
      claimant: "Claimant",
      respondent: "Respondent",
    },
    disputeEvent: {
      filed: "Filed",
      assigned: "Assigned",
      "status-change": "Status change",
      comment: "Comment",
      "field-visit": "Field visit",
      "document-added": "Document added",
      hearing: "Hearing",
      resolved: "Resolved",
    },
    landUse: {
      agricultural: "Agricultural",
      residential: "Residential",
      commercial: "Commercial",
      industrial: "Industrial",
      mixed: "Mixed use",
      vacant: "Vacant",
    },
    ownershipType: {
      sole: "Sole",
      joint: "Joint",
      inherited: "Inherited",
      corporate: "Corporate",
      government: "Government",
    },
    acquisitionType: {
      purchase: "Purchase",
      inheritance: "Inheritance",
      gift: "Gift",
      grant: "Grant",
      partition: "Partition",
      "court-order": "Court order",
    },
    restrictionType: {
      mortgage: "Mortgage",
      injunction: "Court injunction",
      attachment: "Attachment",
      acquisition: "Under acquisition",
      "non-transferable": "Non-transferable",
    },
    mutationType: {
      sale: "Sale",
      inheritance: "Inheritance",
      gift: "Gift",
      partition: "Partition",
      correction: "Correction",
    },
    heirRelation: {
      husband: "Husband",
      wife: "Wife",
      son: "Son",
      daughter: "Daughter",
      father: "Father",
      mother: "Mother",
    },
    successionMethod: {
      faraiz: "Faraiz (Muslim)",
      hindu: "Hindu succession",
    },
    auditAction: {
      create: "Create",
      update: "Update",
      "status-change": "Status change",
      approve: "Approve",
      reject: "Reject",
      assign: "Assign",
      ruling: "Ruling",
      upload: "Upload",
      delete: "Delete",
    },
    areaUnit: {
      decimal: "decimal",
      katha: "katha",
      bigha: "bigha",
      acre: "ac",
      sqm: "m²",
      sqft: "ft²",
    },
  },

  // ── Shared components ────────────────────────────────────────────────────
  // ── Screens ──────────────────────────────────────────────────────────────
  /**
   * Display labels for `extractedFields` keys. The keys themselves are data —
   * the reader emits them, `REQUIRED_FIELDS` matches on them, and the backend
   * stores them — so they stay English in the record and are only labelled here.
   */
  fields: {
    "Dag No": "Dag No",
    Khatian: "Khatian",
    Owner: "Owner",
    "Stamp Value": "Stamp value",
    "Order No": "Order No",
    Area: "Area",
    Deceased: "Deceased",
    "Case No": "Case No",
    Amount: "Amount",
    Name: "Name",
    Signature: "Signature",
    "Document type": "Document type",
    "Pages read": "Pages read",
  } as Record<string, string | undefined>,

  pages: {

    disputes: {
      description: "Every case you've filed, with its current stage and latest update.",
      file: "File a dispute",
      emptyTitle: "No disputes filed",
      emptyBody:
        "If a boundary, ownership, or inheritance issue comes up, file it here to start a case.",
    },

    cases: {
      description: "Disputes referred to you for hearing, deliberation, and ruling.",
      emptyTitle: "No cases assigned",
      emptyBody: "Disputes escalated to mediation will be listed here.",
      partySeparator: " vs ",
      hearingAt: (when: string) => `Hearing ${when}`,
      sessions: (count: number) => `${n(count)} session${count === 1 ? "" : "s"}`,
      ruling: "Ruling",
      viewDispute: "View dispute record",
      openCase: "Open case",

      // Cases referred to mediation with no hearing listed yet.
      toConvene: "Awaiting a hearing date",
      toConveneBody: "Referred to mediation. Set a date to list the case.",
      noneToConvene: "Every referred case has a hearing listed.",
      hearingDate: "Hearing date",
      convene: "List for hearing",
      convening: "Listing…",
      convened: (caseNumber: string) => `${caseNumber} is listed for hearing.`,
      partiesLabel: "Parties",
      listed: "Listed cases",
    },

    hearing: {
      eyebrow: "Mediation",
      notFound: "That case could not be found.",
      backToCases: "Back to cases",
      scheduledFor: (when: string) => `Hearing scheduled ${when}`,

      // Parties
      parties: "Parties",
      heard: "Heard",
      notHeard: "Not yet heard",

      // Sessions
      sessions: "Sittings",
      noSessions: "No sittings recorded yet.",
      attendees: "Present",
      recordSession: "Record a sitting",
      summary: "What happened",
      summaryHint: "What was presented, argued, and agreed.",
      summaryPlaceholder: "Summarise the sitting…",
      whoAttended: "Who attended",
      whoAttendedHint: "Tick each party who was present.",
      saveSession: "Save sitting",
      savingSession: "Saving…",
      sessionSaved: "Sitting recorded.",

      // Ruling
      ruling: "Ruling",
      rulingHint: "The decision on the record. This closes the case.",
      rulingPlaceholder: "State the decision…",
      issueRuling: "Issue ruling",
      issuing: "Issuing…",
      ruled: "Ruling issued.",
      ruledAt: (when: string) => `Ruled ${when}`,
      needsBefore: "Before ruling:",

      blocker: {
        alreadyDecided: "This case has already been decided.",
        noSessions: "Hold a sitting before ruling — no party has been heard yet.",
        /** Natural justice: a case is not decided against someone never heard. */
        unheard: (parties: string) =>
          `Has not attended a sitting yet: ${parties}. A case cannot be decided against a party who has not been heard.`,
        needRuling: "Write the decision.",
      },
    },

    visits: {
      description:
        "Your on-the-ground surveys. Capture GPS points, photos, and notes on site.",
      emptyTitle: "No visits assigned",
      emptyBody: "New survey assignments from the land office will appear here.",
      gpsCount: (count: number) => `${n(count)} GPS`,
      photoCount: (count: number) => `${n(count)} photos`,
      openCapture: "Open capture",
      submitted: (when: string) => `Submitted ${when}`,
    },

    capture: {
      eyebrow: "Field survey",
      notFound: "That visit could not be found.",
      backToVisits: "Back to visits",
      scheduled: (when: string) => `Scheduled ${when}`,

      // Status ladder
      markEnRoute: "Mark en route",
      markOnSite: "Mark on site",

      // Evidence
      evidence: "Evidence",
      gpsPoints: "GPS points",
      photos: "Photos",
      capturePoint: "Capture point",
      capturing: "Capturing…",
      addPhoto: "Add photo",
      pointLabel: "Point label",
      pointLabelHint: "What you are standing on — e.g. NE corner pillar.",
      photoCaption: "Caption",
      photoCaptionHint: "What the picture shows.",
      accuracy: (metres: number) => `±${n(metres)} m accuracy`,
      noGps: "No points captured yet.",
      noPhotos: "No photos yet.",
      photoPlaceholder: "Photo",
      /** The mock has no camera or object store; captures are simulated. */
      simulatedNote:
        "Device GPS is used when available; otherwise a point near the parcel is simulated for this preview.",
      simulatedPoint: "Simulated",

      // Notes + filing
      notes: "Findings",
      notesHint: "What you observed on the ground. This is what the case reads.",
      notesPlaceholder: "Describe what you found…",
      fileReport: "File report",
      filing: "Filing…",
      filed: "Report filed.",
      needsBefore: "Before filing:",
      required: (have: number, need: number) => `${n(have)} of ${n(need)}`,

      blocker: {
        notActionable: "This report is already closed.",
        needGps: (have: number, need: number) =>
          `Capture ${n(need)} GPS point${need === 1 ? "" : "s"} — you have ${n(have)}.`,
        needPhotos: (have: number, need: number) =>
          `Add ${n(need)} photo${need === 1 ? "" : "s"} — you have ${n(have)}.`,
        needNotes: "Write your findings.",
      },
    },

    policies: {
      description: "Configure fees, objection windows, and fraud-scoring thresholds.",
      mutationFee: "Mutation fee",
      mutationFeeHint: "Amount in BDT charged per mutation application.",
      objectionWindow: "Objection window",
      objectionWindowHint: "Number of days for parties to file objections.",
      days: "days",
      fraudThreshold: "Fraud score threshold",
      fraudThresholdHint: "Minimum score (0–1) to flag a document for manual review.",
      saved: "Policies updated successfully.",
    },

    users: {
      description: "People with access to PlotGuard across every portal and jurisdiction.",
      emptyTitle: "No users found",
      colName: "Name",
      colRole: "Role",
      colJurisdiction: "Jurisdiction",
      colStatus: "Status",
    },

    documents: {
      description:
        "Title deeds, affidavits, and receipts you've submitted, with OCR and verification status.",
      upload: "Upload document",
      reading: (count: number) =>
        `Reading ${n(count)} document${count === 1 ? "" : "s"} — this page updates on its own.`,
      emptyTitle: "No documents yet",
      emptyBody: "Upload a title deed or affidavit to get started.",
      colDocument: "Document",
      colType: "Type",
      colOcr: "OCR",
      colVerification: "Verification",
      colUploaded: "Uploaded",
      pages: (count: number) => `${n(count)} pages`,
    },

    records: {
      description: "Search and maintain the parcel register for your jurisdiction.",
      searchPlaceholder: "Search plot no., title, or owner…",
      emptyTitle: "No matching records",
      emptyBody: "Try a different plot number, owner name, or status filter.",
      colDagKhatian: "Dag / Khatian",
      colTitle: "Title",
      colOwner: "Owner",
      colLandUse: "Land use",
      colArea: "Area",
      colStatus: "Status",
      colDisputes: "Disputes",
    },

    audit: {
      description:
        "Every record change is written to an append-only, SHA-256 hash-chained ledger. Altering any entry breaks the chain — tamper-evident by construction.",
      verify: "Verify integrity",
      chainIntact: "Chain intact",
      chainBroken: "Chain broken",
      verifiedCount: (count: number) => `${n(count)} events verified · no tampering detected`,
      brokenAt: (index: number) => `Verification failed at event #${d(index)}`,
      prevGenesis: "genesis",
      genesisTitle: "genesis block",
      prevLabel: "prev",
      hashLabel: "hash",
    },

    dashboard: {
      welcome: "Welcome back",
      welcomeNamed: (firstName: string) => `Welcome back, ${firstName}`,
      description: "Your land records, disputes, and requests — all in one place.",
      uploadDocument: "Upload document",
      fileDispute: "File a dispute",
      statParcels: "My parcels",
      statOpenDisputes: "Open disputes",
      statDocsToAction: "Docs to action",
      statUnread: "Unread alerts",
      yourParcels: "Your parcels",
      searchAll: "Search all",
      noParcelsTitle: "No parcels linked yet",
      noParcelsBody: "Search the registry to find and claim parcels registered to your name.",
      searchRecords: "Search records",
      activeDisputes: "Active disputes",
      allDisputes: "All disputes",
      noDisputesTitle: "No active disputes",
      noDisputesBody:
        "If a boundary, ownership, or inheritance issue comes up, you can file it here.",
      recentActivity: "Recent activity",
      noActivity: "No activity yet.",
    },

    parcel: {
      notFoundTitle: "Parcel not found",
      notFoundBody: "This record may have been moved or the link is incorrect.",
      backToSearch: "Back to search",
      khatian: (khatianNo: string) => `Khatian ${khatianNo}`,
      /** Tooltip on the land ID chip — says what the number is for. */
      ulpinTitle: "Land ID — quote this to identify the plot",
      mapTitle: "Location",
      mapHint: "This plot in accent, nearby plots alongside. Click a plot to open it.",
      /** Shown because every boundary in the demo dataset is a synthetic square. */
      mapApproximate: "Boundaries shown are indicative, not survey-accurate.",
      neighbours: "Nearby plots",
      restrictions: "Restrictions",
      restrictionsNone: "No restrictions on record. This plot is free to transfer.",
      /** Shown when at least one active restriction bars a transfer outright. */
      transferBlocked: "This plot cannot be transferred while these stand.",
      /** Shown when the only active restrictions are releasable ones. */
      transferConsent: "This plot can be transferred once the holder releases its claim.",
      restrictionLifted: (date: string) => `Lifted ${date}`,
      restrictionSince: (date: string) => `In force since ${date}`,
      subtitle: (landUse: string, ownershipType: string) =>
        `${landUse} land · ${ownershipType} ownership`,
      area: "Area",
      marketValue: "Market value",
      registered: "Registered",
      centroid: "Centroid",
      owner: "Owner",
      chainOfTitle: "Chain of title",
      present: "present",
      current: "Current",
      noOwnershipHistory: "No ownership history on record.",
      documents: "Documents",
      noDocuments: "No documents linked.",
      disputes: "Disputes",
      noDisputes: "No disputes on this parcel.",
    },

    dispute: {
      notFoundTitle: "Dispute not found",
      notFoundBody: "This case may have been withdrawn or the link is incorrect.",
      backToDisputes: "Back to disputes",
      heading: (type: string) => `${type} dispute`,
      timeline: "Case timeline",
      noEvents: "No events recorded yet.",
      details: "Details",
      filedBy: "Filed by",
      filed: "Filed",
      lastUpdate: "Last update",
      hearing: "Hearing",
      parties: "Parties",
      evidence: "Evidence",
    },

    search: {
      description:
        "Look up any parcel in the register by dag number, khatian, owner, or place.",
      quickSearch: "Quick search",
      byDagKhatian: "By dag / khatian",
      quickPlaceholder: "Dag no., khatian, owner, or place…",
      quickAria: "Search the register",
      dagLabel: "Dag no.",
      dagPlaceholder: "e.g. CS-142/3",
      khatianLabel: "Khatian no.",
      khatianPlaceholder: "e.g. 512",
      searching: "Searching the register…",
      matched: (count: string) => `${count} matched`,
      inRegister: (count: string) => `${count} in the register`,
      parcelCount: (count: number) => `${n(count)} ${count === 1 ? "parcel" : "parcels"}`,
      updating: " · updating",
      clearSearch: "Clear search",
      emptyTitle: "No parcels match",
      emptyBody:
        "Check the dag number's survey prefix (CS, RS, BS), or search by the owner's name instead.",
      loadMore: "Load more",
      whereThese: "Where these are",
    },

    upload: {
      title: "Upload a document",
      description:
        "Add a deed, affidavit, or receipt. We'll read the text automatically and send it for verification.",
      dropHere: "Drop a file here, or browse",
      constraints: "PDF or image, up to 20 MB",
      removeFile: "Remove file",
      tooLargeTitle: "File is too large",
      tooLargeBody: "Please upload a file under 20 MB.",
      documentType: "Document type",
      selectType: "Select a type",
      linkParcel: "Link to a parcel",
      notLinked: "Not linked",
      upload: "Upload",
      receivedTitle: "Upload received",
      receivedBody: (fileName: string) =>
        `${fileName} is being read. You'll be notified when it's processed.`,
      failedTitle: "Upload failed",
      failedBody: "Please check the file and try again.",
      /** The names people actually use at the counter, not the enum's. */
      types: {
        "title-deed": "Khatian / title deed",
        "sale-deed": "Dolil / sale deed",
        "inheritance-affidavit": "Warish (inheritance) affidavit",
        "tax-receipt": "Khajna (tax) receipt",
        "id-proof": "NID / ID proof",
        "court-order": "Court order",
        "survey-report": "Survey report",
        photo: "Photograph",
      },
    },

    inheritance: {
      title: "Inheritance calculator",
      description:
        "Estimate succession shares under Faraiz (Islamic) or Hindu law, then start an inheritance mutation.",
      successionLaw: "Succession law",
      estateValue: "Estate value",
      currencySymbol: "৳",
      survivingHeirs: "Surviving heirs",
      calculate: "Calculate shares",
      distribution: "Distribution",
      emptyResult: "Add heirs and calculate to see the distribution.",
      decrease: (label: string) => `Decrease ${label}`,
      increase: (label: string) => `Increase ${label}`,
      times: (count: number) => ` × ${n(count)}`,
      heirs: {
        husband: { label: "Husband", hint: "max 1" },
        wife: { label: "Wife", hint: "up to 4" },
        son: { label: "Sons", hint: "" },
        daughter: { label: "Daughters", hint: "" },
        father: { label: "Father", hint: "max 1" },
        mother: { label: "Mother", hint: "max 1" },
      },
      errors: {
        spouseBoth: "A person leaves either a husband or a wife — not both.",
        noHeirs: "Add at least one surviving heir.",
      },
      /** Caveats the calculator returns as codes — see InheritanceNote. */
      notes: {
        "faraiz-scope": "Simplified Faraiz: spouse, parents, sons and daughters only.",
        "faraiz-omissions": "Does not model grandchildren, siblings, \u2018awl/radd, or bequests.",
        "faraiz-residue":
          "Residue left unassigned (radd not applied in this simplified model).",
        "hindu-scope": "Simplified Hindu succession: Class-I heirs share equally per head.",
        "hindu-omissions":
          "Widow/widower, mother, sons and daughters included; remoter heirs omitted.",
      },
    },

    mutations: {
      description:
        "Ownership-transfer requests awaiting decision. A transfer can only be approved once its objection window has closed and any objections are resolved.",
      allInJurisdiction: "All in jurisdiction",
      assignedToMe: "Assigned to me",
      loadingQueue: "Loading the queue…",
      requestCount: (count: number) => `${n(count)} ${count === 1 ? "request" : "requests"}`,
      emptyFilteredTitle: "Nothing in this view",
      emptyFilteredBody:
        "No transfer requests match this scope and status. Try widening the filter.",
      emptyTitle: "No mutations pending",
      emptyBody: "New namjari applications will land here as citizens file them.",
      transfersTo: "transfers to",
      requested: (when: string) => `Requested ${when}`,
      documentCount: (count: number) => `${n(count)} ${count === 1 ? "document" : "documents"}`,
      fee: (amount: string) => `Fee ${amount}`,
      decided: (when: string) => `Decided ${when}`,
      windowCloses: (ago: string, on: string) =>
        `Objection window closes ${ago} — on ${on}`,
      windowClosed: (on: string) => `Objection window closed ${on}`,
      objectionsOnRecord: (count: number) =>
        `${n(count)} ${count === 1 ? "objection" : "objections"} on record`,
      /** Why approval is held — see MutationHold in lib/mutations.ts. */
      hold: {
        objections: (count: number) =>
          `${n(count)} objection${count === 1 ? "" : "s"} must be resolved before this transfer can be approved.`,
        objectionWindow: (days: number) =>
          `The statutory objection window is still open — it closes in ${n(days)} day${days === 1 ? "" : "s"}.`,
      },
      closed: "This mutation is closed and recorded in the audit ledger.",
      inProgress: "In progress — the land office will update this as it moves.",
      viewParcel: "View parcel",
      citizenDescription:
        "Applications you have filed to change the recorded owner of a parcel, and where each one stands.",
      newApplication: "New application",
      citizenEmptyTitle: "No mutation applications yet",
      citizenEmptyBody:
        "File one after a sale, inheritance, gift, partition, or court order to move the record into your name.",
      confirmApprove: (owner: string, dagNo: string) =>
        `Record ${owner} as the owner of ${dagNo}?`,
      confirmReject: (mutationNumber: string) => `Reject ${mutationNumber}?`,
      yesApprove: "Yes, approve",
      yesReject: "Yes, reject",
      approve: "Approve namjari",
      reject: "Reject",
      approvedTitle: "Mutation approved",
      approvedBody: (mutationNumber: string, dagNo: string, owner: string) =>
        `${mutationNumber} — ${dagNo} now records ${owner} as owner.`,
      rejectedTitle: "Mutation rejected",
      rejectedBody: (mutationNumber: string) =>
        `${mutationNumber} was rejected. The applicant will be notified.`,
      failedTitle: "Decision failed",
      failedBody: "Please try again.",
    },

    newDispute: {
      title: "File a dispute",
      description:
        "Raise a boundary, ownership, inheritance, or fraud case for review by the land office.",
      steps: { parcel: "Parcel", details: "Details", review: "Review" },
      whichParcel: "Which parcel is this about?",
      noParcels: "No parcels linked to your account",
      typeOfDispute: "Type of dispute",
      priority: "Priority",
      whatHappened: "What happened?",
      descriptionPlaceholder:
        "Describe the issue — where on the plot, when it started, and what you're asking the office to do.",
      otherParty: "Other party",
      otherPartyPlaceholder: "Name of the person or body you have the dispute with",
      reviewAndSubmit: "Review and submit",
      rowParcel: "Parcel",
      rowType: "Type",
      rowPriority: "Priority",
      rowOtherParty: "Other party",
      rowDescription: "Description",
      notSpecified: "Not specified",
      filedAs: (name: string) =>
        `Filed as ${name} · you can add evidence documents after the case is created.`,
      you: "you",
      continue: "Continue",
      filing: "Filing…",
      file: "File dispute",
      filedTitle: "Dispute filed",
      filedBody: (caseNumber: string) => `${caseNumber} has been submitted.`,
      failedTitle: "Could not file the dispute",
      failedBody: "Please try again.",
      /** What each dispute kind means, in the citizen's words. */
      blurbs: {
        boundary: "Unclear demarcation between plots.",
        ownership: "Competing claims over who owns the land.",
        inheritance: "Faraiz / succession share disagreement.",
        encroachment: "Someone occupying or building on your land.",
        fraud: "Forged deed, double sale, or tampered record.",
        easement: "Right of way or access dispute.",
      },
      errors: {
        parcelRequired: "Select the parcel this dispute is about.",
        descriptionShort: "Please describe the issue in at least 20 characters.",
        descriptionLong: "Keep the description under 1000 characters.",
      },
    },

    newMutation: {
      title: "File a mutation (namjari)",
      description:
        "Apply to change the recorded owner of a parcel after a sale, inheritance, gift, partition, or court order.",
      steps: { parcel: "Parcel", transfer: "Transfer", payment: "Payment", review: "Review" },
      whichParcel: "Which parcel is this about?",
      noParcels: "No parcels linked to your account",
      typeOfTransfer: "Type of transfer",
      toOwnerLabel: "New owner's name",
      toOwnerPlaceholder: "Full name as it should appear on the record",
      deedNumberLabel: "Deed number",
      deedNumberPlaceholder: "e.g. 4821/2026",
      deedDateLabel: "Deed date",
      paymentTitle: "Filing fee",
      feeLabel: "Amount due",
      paymentMethodLabel: "Pay with",
      paymentMethods: { bkash: "bKash", nagad: "Nagad", card: "Card" },
      paymentNote:
        "This is a simulated payment for demonstration — no money moves and no payment details are collected.",
      reviewAndSubmit: "Review and submit",
      rowParcel: "Parcel",
      rowType: "Type",
      rowToOwner: "New owner",
      rowDeed: "Deed",
      rowPayment: "Payment",
      notSpecified: "Not specified",
      filedAs: (name: string) =>
        `Filed as ${name} · you can add supporting documents after the application is created.`,
      you: "you",
      continue: "Continue",
      filing: "Filing…",
      file: "File application",
      filedTitle: "Mutation filed",
      filedBody: (mutationNumber: string) => `${mutationNumber} has been submitted.`,
      failedTitle: "Could not file the application",
      failedBody: "Please try again.",
      /** What each transfer kind means, in the citizen's words. */
      blurbs: {
        sale: "The land was bought and sold.",
        inheritance: "Passed on after the previous owner's death.",
        gift: "Given without payment, by deed of gift.",
        partition: "Split among joint owners.",
        correction: "Fixing an error in who the record names as owner.",
      },
      errors: {
        parcelRequired: "Select the parcel this application is about.",
        toOwnerRequired: "Enter the name of the new owner.",
      },
    },

    fraudReview: {
      description:
        "Documents flagged by automated scoring — image forensics, stamp checks, and field mismatches. Clear them as genuine or reject them.",
      emptyTitle: "Queue clear",
      emptyBody:
        "No documents are currently flagged. New flags from the fraud scorer will appear here.",
      fraudScore: "Fraud score",
      notScored: "Not scored · flagged by an officer",
      scoreLine: (percent: string, risk: string) => `${percent} · ${risk}`,
      risk: { high: "High risk", suspicious: "Suspicious", low: "Low risk" },
      uploaded: (when: string) => `Uploaded ${when}`,
      clear: "Clear as genuine",
      reject: "Reject document",
      rerun: "Re-run analysis",
      clearedTitle: "Document cleared",
      clearedBody: (fileName: string) => `${fileName} is now marked verified.`,
      rejectedTitle: "Document rejected",
      rejectedBody: (fileName: string) =>
        `${fileName} was rejected and the uploader will be notified.`,
      failedTitle: "Decision failed",
      failedBody: "Please try again.",
      requeuedTitle: "Sent back for analysis",
      requeuedBody: (fileName: string) => `${fileName} re-queued for OCR and fraud scoring.`,
      requeueFailedTitle: "Could not re-queue",
    },

    ocrQueue: {
      description:
        "Scans moving through text extraction. An extraction only enters the register once every required field is captured and nothing on the paper contradicts the record.",
      stages: {
        ready: { label: "Ready to check", hint: "Waiting on an officer" },
        failed: { label: "Unreadable", hint: "Needs a retry" },
        processing: { label: "Reading", hint: "Extraction running" },
        pending: { label: "Queued", hint: "Waiting for a reader" },
      },
      stageTileAria: (stage: string, count: number) =>
        `${stage}: ${n(count)} ${count === 1 ? "document" : "documents"}`,
      loadingQueue: "Loading the queue…",
      countInStage: (count: number, stage: string) =>
        `${n(count)} ${count === 1 ? "document" : "documents"} in ${stage.toLowerCase()}`,
      countInQueue: (count: number) =>
        `${n(count)} ${count === 1 ? "document" : "documents"} in the queue`,
      waitingOnYou: (count: number) => ` · ${n(count)} waiting on you`,
      showAllStages: "Show all stages",
      emptyStageTitle: "Nothing at this stage",
      emptyStageBody:
        "No documents are sitting here right now. Clear the filter to see the rest of the pipeline.",
      emptyTitle: "Queue clear",
      emptyBody: "Every scan has been read and checked. New uploads land here automatically.",
      uploaded: (when: string) => `Uploaded ${when}`,
      queuedNotice: "Queued for the next free reader — this card updates on its own.",
      readingNotice: "Reading the scan — this card updates on its own.",
      requiredFields: "Required fields",
      captured: (found: number, total: number) => `${n(found)}/${n(total)} captured`,
      noRegisterFields: "This document type carries no register fields.",
      keyInPlaceholder: "Key in from scan",
      keyInAria: (field: string) => `${field} — not found by the reader`,
      doesNotMatch: "Does not match the register",
      accept: "Accept into record",
      escalate: "Send to fraud review",
      rerun: "Re-run extraction",
      retry: "Retry extraction",
      returnToUploader: "Return to uploader",
      nothingToDo: "Nothing to do until the reader finishes.",
      /** Why acceptance is held — see ExtractionHold in lib/ocr.ts. */
      hold: {
        inFlight: "The reader is still working through this scan.",
        failed:
          "The reader could not get text off this scan. Retry it, or ask for a fresh scan of the paper.",
        mismatch: (fields: string) =>
          `${fields} on the scan does not match the register. Send this for fraud review rather than accepting it.`,
        missing: (count: number) =>
          `${n(count)} required field${count === 1 ? "" : "s"} still missing — key ${count === 1 ? "it" : "them"} in from the scan to accept this extraction.`,
      },
      fieldJoiner: " and ",
      mismatchDetail: (field: string, scanned: string, registered: string) =>
        `Scan reads ${scanned} for ${field}; the register has ${registered} for this parcel.`,
      acceptedTitle: "Extraction accepted",
      acceptedBody: (fileName: string, target: string) =>
        `${fileName} is recorded against ${target}.`,
      theRegister: "the register",
      acceptFailedTitle: "Could not accept",
      escalatedTitle: "Sent to fraud review",
      escalatedBody: (fileName: string) => `${fileName} is now in the fraud-review queue.`,
      escalateFailedTitle: "Could not escalate",
      returnedTitle: "Document returned",
      returnedBody: (fileName: string) =>
        `${fileName} was rejected and the uploader will be notified.`,
      rejectFailedTitle: "Could not reject",
      requeuedTitle: "Re-queued for extraction",
      requeuedBody: (fileName: string) => `${fileName} is going back through the reader.`,
      requeueFailedTitle: "Could not re-queue",
      tryAgain: "Please try again.",
    },

    agents: {
      description:
        "Book surveys for cases that need someone on the ground, and see who is carrying what. An agent has to cover the parcel's jurisdiction — sending someone outside theirs takes a deliberate override.",
      roster: "Agents on the roll",
      rosterTileAria: (name: string, load: number) =>
        `${name}, ${n(load)} open ${load === 1 ? "visit" : "visits"}`,
      openVisits: (count: number) => `open ${count === 1 ? "visit" : "visits"}`,
      heavy: " · heavy",
      heavyLoad: " · heavy load",
      openVisitCount: (count: number) =>
        `${n(count)} open ${count === 1 ? "visit" : "visits"}`,
      needsAgent: "Needs an agent",
      loading: "Loading…",
      openCases: (count: number) =>
        `${n(count)} open ${count === 1 ? "case" : "cases"} with nobody booked`,
      allBookedTitle: "Every open case has a visit booked",
      allBookedBody: "New disputes will show up here as soon as they are filed.",
      inTheField: "In the field",
      showEveryAgent: "Show every agent",
      noneForAgentTitle: "Nothing open for this agent",
      noneForAgentBody: "Their queue is clear. Clear the filter to see the rest of the roster.",
      noVisitsTitle: "No visits in progress",
      noVisitsBody: "Surveys you book will appear here until the agent submits a report.",
      disputeHeading: (type: string) => `${type} dispute`,
      filedBy: (name: string) => `Filed by ${name}`,
      callsFor: (survey: string) => `Calls for a ${survey.toLowerCase()}`,
      assign: "Assign an agent",
      viewCase: "View case",
      surveyType: "Survey type",
      scheduledFor: "Scheduled for",
      fieldAgent: "Field agent",
      agentGroupAria: (caseNumber: string) => `Field agent for ${caseNumber}`,
      allowOutside: "Also allow agents from outside this jurisdiction.",
      noneCoverArea:
        "No agent covers this area. Tick to assign someone from outside their jurisdiction anyway.",
      book: "Book the visit",
      outsideArea: (firstName: string) => `Outside ${firstName}'s area`,
      assignedTitle: "Survey assigned",
      assignedBody: (agent: string, dagNo: string, when: string, caseNumber: string) =>
        `${agent} is booked for ${dagNo} on ${when}. ${caseNumber} is now awaiting the visit.`,
      failedTitle: "Could not assign",
      failedBody: "Please try again.",
      /** Why an agent can't take the job — see CandidateBlocker. */
      blocker: {
        inactive: (status: string) =>
          `Account is ${status.toLowerCase()} — reactivate it before assigning work.`,
        outsideArea: (agentArea: string, parcelArea: string) =>
          `Covers ${agentArea}; this parcel is in ${parcelArea}.`,
      },
      /** Worth knowing but not disqualifying — see CandidateNote. */
      note: {
        heavyLoad: (openVisits: number) => `Already carrying ${n(openVisits)} open visits.`,
        sameParcel: "Already going to this parcel — one trip covers both.",
        outsideArea: (agentArea: string, parcelArea: string) =>
          `Outside their area. Covers ${agentArea}; this parcel is in ${parcelArea}.`,
      },
    },

    jurisdictions: {
      description:
        "The administrative tree every parcel, user, and survey assignment hangs off. A node sits exactly one rung below its parent, and nothing can be removed while records still point at it.",
      newJurisdiction: "New jurisdiction",
      hierarchy: "The hierarchy",
      empty: "Empty",
      /** "3 upazilas" / "1 mouza" — the level words arrive already localised. */
      levelCount: (count: number, singular: string, plural: string) =>
        `${n(count)} ${count === 1 ? singular : plural}`,
      emptyTreeTitle: "No jurisdictions yet",
      emptyTreeBody: "Start with a division — every district, upazila, and mouza hangs off one.",
      addDivision: "Add a division",
      unreachableTitle: "Not reachable from any root",
      unreachableBody:
        "Their parent is missing or the links form a loop. Give each one a valid parent.",
      expand: (name: string) => `Expand ${name}`,
      collapse: (name: string) => `Collapse ${name}`,
      parcelsHereTitle: (count: number) => `${plural(count, "parcel")} registered here`,
      usersHereTitle: (count: number) => `${plural(count, "user")} assigned here`,
      addChildAria: (level: string, parent: string) =>
        `Add ${level.toLowerCase()} under ${parent}`,
      addChildTitle: (level: string) => `Add ${level.toLowerCase()}`,
      addChild: (level: string) => `Add ${level.toLowerCase()}`,
      newLevel: (level: string) => `New ${level.toLowerCase()}`,
      under: (parent: string) => `Under ${parent}.`,
      atTop: "At the top of the tree.",
      ancestry: "Ancestry",
      childrenLabel: "children",
      // Annotated: without it TypeScript infers a literal union and no other
      // locale can satisfy the type.
      parcelsHere: (count: number): string => (count === 1 ? "parcel here" : "parcels here"),
      usersHere: (count: number): string => (count === 1 ? "user here" : "users here"),
      inSubtree: (count: number) => `${n(count)} in the subtree`,
      withSubtree: (count: number) => `${n(count)} with the subtree`,
      bottomOfLadder: "A mouza is the bottom of the ladder — nothing sits under it.",
      pickTitle: "Pick a jurisdiction",
      pickBody:
        "Choose one from the tree to see what is registered under it, rename or move it, or add the rung below.",
      // Form
      name: "Name",
      namePlaceholder: "Debidwar Upazila",
      nameBn: "Name in Bangla",
      nameBnHint: "Optional — as it reads on the record.",
      nameBnPlaceholder: "দেবিদ্বার উপজেলা",
      code: "Code",
      codeHint: "Uppercase, hyphen-separated.",
      codePlaceholder: "CTG-CUM-DEB",
      level: "Level",
      sitsUnder: "Sits under",
      divisionIsTop: "A division is the top of the tree.",
      noParentYet: (level: string) => `No ${level.toLowerCase()} exists yet — add one first.`,
      nothingToSitUnder: "Nothing to sit under",
      topOfTree: "Top of the tree",
      movingWarning: (parcels: number, users: number) =>
        `Moving this takes ${plural(parcels, "parcel")} and ${plural(users, "user")} with it. Agent coverage is read from this tree, so who may be sent where changes with it.`,
      saveChanges: "Save changes",
      addToTree: "Add to the tree",
      discard: "Discard",
      updatedTitle: "Jurisdiction updated",
      addedTitle: "Jurisdiction added",
      savedBody: (name: string, code: string, editing: boolean) =>
        `${name} (${code}) is ${editing ? "saved" : "on the tree"}.`,
      // Deletion
      stillInUse: "Still in use — it cannot be removed yet",
      remove: (name: string) => `Remove ${name}`,
      confirmRemove: (name: string) =>
        `Remove ${name}? Nothing points at it, so this is safe — but it cannot be undone.`,
      removeIt: "Remove it",
      keepIt: "Keep it",
      removedTitle: "Jurisdiction removed",
      removedBody: (name: string) => `${name} is off the tree.`,
      /** Why a field is rejected — see JurisdictionError in lib/jurisdictions.ts. */
      error: {
        nameRequired: "Give it a name.",
        codeRequired: "Give it a code.",
        codePattern: "Uppercase letters, digits and hyphens only — e.g. CTG-CUM-DEB.",
        codeTaken: (holderName: string, holderCode: string) =>
          `${holderName} already uses ${holderCode}.`,
        divisionHasNoParent: "A division sits at the top of the tree — it has no parent.",
        parentRequired: (needs: string, level: string) =>
          `Pick the ${needs.toLowerCase()} this ${level.toLowerCase()} belongs to.`,
        parentMissing: "That parent no longer exists.",
        parentWrongLevel: (
          level: string,
          needs: string,
          parentName: string,
          parentLevel: string,
        ) =>
          `${sentence(withArticle(level.toLowerCase()))} sits under ${withArticle(needs.toLowerCase())}, and ${parentName} is ${withArticle(parentLevel.toLowerCase())}.`,
        selfParent: "It cannot be its own parent.",
        cycle: (parentName: string, currentName: string) =>
          `${parentName} already sits beneath ${currentName} — moving it there would close a loop.`,
        thisOne: "this one",
        childrenStranded: (
          count: number,
          exampleName: string,
          exampleLevel: string,
          wants: string | null,
        ) =>
          `${n(count)} ${count === 1 ? "child" : "children"} would be left on the wrong rung — ${exampleName} is ${withArticle(exampleLevel.toLowerCase())}, which has to sit under ${wants ? withArticle(wants.toLowerCase()) : "nothing"}.`,
      },
      /** Conventions, flagged and never enforced. See JurisdictionWarning. */
      warning: {
        codePrefix: (parentCode: string) =>
          `Codes here extend the parent's. Starting it ${parentCode}- keeps it findable by prefix.`,
        staleDescendantCodes: (count: number, currentCode: string) =>
          `${n(count)} ${count === 1 ? "code" : "codes"} beneath it still start with ${currentCode}.`,
        siblingName: (name: string) =>
          `Another jurisdiction under the same parent is already called ${name}.`,
      },
      /** What is in the way of a delete, with the fix. See DeletionBlocker. */
      blocker: {
        missing: { label: "It no longer exists", fix: "Reload the page." },
        children: (count: number, level: string | null) => ({
          label: `${plural(count, level ? level.toLowerCase() : "jurisdiction")} beneath it`,
          fix: "Re-parent or remove the rung below first.",
        }),
        parcels: (count: number) => ({
          label: `${plural(count, "parcel")} registered here`,
          fix: "Re-register against another jurisdiction first.",
        }),
        users: (count: number) => ({
          label: `${plural(count, "user")} assigned here`,
          fix: "Reassign from the Users screen first.",
        }),
      },
    },
    properties: {
      description: "Land recorded in your name. Open a plot for its title chain, documents, and disputes.",
      count: (n: number) => `${d(n)} ${n === 1 ? "plot" : "plots"} on record`,
      emptyTitle: "No land recorded in your name",
      emptyBody:
        "Plots appear here once a record lists you as owner. If you believe a record is missing, search for it and check who it names.",
      searchRecords: "Search records",
      /** Sits under the heading — says where these came from, not what to do. */
      note: "Ownership shown as currently recorded. A pending mutation does not change it until approved.",
    },

    portal: {
      description:
        "Every land service in one place. Pick a service to begin, or track something you have already filed.",
      comingSoon: "Coming soon",
      openService: "Open",
      services: {
        mutation: "Mutation",
        mutationBody: "Transfer a record after a sale, inheritance, gift, or court order (e-Namjari).",
        landTax: "Land development tax",
        landTaxBody: "See what is assessed against your land and pay your yearly khajna.",
        recordsMaps: "Records & maps",
        recordsMapsBody: "Look up a plot by dag, khatian, owner, or land ID, and see it on the map.",
        acquisition: "Acquisition & requisition",
        acquisitionBody: "Notices affecting your land, compensation awards, and objections.",
        lease: "Lease & settlement",
        leaseBody: "Apply for settlement of khas land, agricultural or non-agricultural.",
        landAdmin: "Land administration",
        landAdminBody: "Certified copies of records, and corrections to what is on file.",
        revenueCases: "Revenue cases",
        revenueCasesBody: "File and follow a case before the revenue court.",
        infoBank: "Land information bank",
        infoBankBody: "Browse khas, acquired, and government land on record.",
      },
    },

    landTax: {
      description:
        "Land development tax (khajna) assessed on each holding you own, including any unpaid earlier years. Pay online and the receipt is recorded against the plot.",
      totalDueLabel: (count: string) => `Due across ${count} holding${count === "1" ? "" : "s"}`,
      yearLabel: (year: string) => `${year} assessment`,
      decimals: (value: string) => `${value} decimal`,
      colYear: "Year",
      colAssessed: "Assessed",
      colSurcharge: "Surcharge",
      colDue: "Due",
      arrear: "Arrear",
      arrearsNotice: (amount: string) =>
        `${amount} of this is unpaid tax from earlier years, with the late surcharge added.`,
      settled: (year: string) => `Paid in full through ${year}.`,
      pay: "Pay now",
      confirmPay: (amount: string) => `Pay ${amount}`,
      viewParcel: "View parcel",
      paymentMethods: { bkash: "bKash", nagad: "Nagad", card: "Card" },
      paymentNote:
        "This is a simulated payment for demonstration — no money moves and no payment details are collected.",
      paidTitle: "Tax paid",
      paidBody: (dagNo: string, transactionId: string) =>
        `${dagNo} is settled for this year. Reference ${transactionId}.`,
      failedTitle: "Payment could not be recorded",
      failedBody: "Please try again.",
      emptyTitle: "No holdings on record",
      emptyBody: "Land development tax is assessed per plot. Plots recorded in your name will appear here.",
      /** Why a holding owes nothing — see ExemptionReason in @plotguard/rules. */
      exempt: {
        smallholder: (threshold: string) =>
          `Exempt — agricultural holdings of ${threshold} decimal or less pay no land development tax.`,
        zeroRated: (landUse: string) => `Exempt — ${landUse} land is not taxed in this district.`,
      },
    },

    landing: {
      wordmark: "BhumiSetu",
      helpline: "16XXX",
      navHome: "Home",
      navAbout: "About Us",
      navLearn: "Learn",
      navLearnBhumiId: "BhumiID",
      navLearnNamjari: "Namjari process",
      navLearnFaraiz: "Faraiz inheritance guide",
      navLearnSurvey: "Survey cycles explained",
      navHelp: "Help & Support",
      navRegister: "Register (BhumiID)",
      heroHeadline1: "The Integrated Platform for Transparent, Secure Land Management.",
      heroHeadline2: "The Integrated Platform for Transparent, Secure Land Management.",
      heroHeadline3: "The Integrated Platform for Transparent, Secure Land Management.",
      quickLinkGuide: "Citizen Portal Guide",
      quickLinkMediator: "Mediator Registration",
      quickLinkFieldAgent: "Field Agent Application",
      quickLinkPolicy: "Support Center Policy",
      supportCall: "Call for land service support",
      liveChat: "Start Live Chat",
      servicesHeading: "Our Core Services",
      services: {
        citizenPortal: "Citizen Portal",
        citizenPortalDesc: "38 features across 7 categories",
        disputeRes: "Dispute Resolution",
        disputeResDesc: "Resolve conflicts effectively",
        lawyerMarket: "Lawyer & Mediator Marketplace",
        lawyerMarketDesc: "Find legal experts",
        guardianMode: "Guardian Mode",
        guardianModeDesc: "Protect vulnerable owners",
        charTracker: "Char Land Satellite Time-Lapse Tracker",
        charTrackerDesc: "Track shifting lands",
        womenShare: "Women's Legal Share Lock",
        womenShareDesc: "Secure inheritance shares",
        videoKyc: "Video-KYC PoA Verification",
        videoKycDesc: "Verify power of attorney",
        panicReport: "Land Occupation Panic Report",
        panicReportDesc: "Urgent dispute reporting",
      },
      trustStats: {
        districts: "Land data connected across all 64 districts",
        users: "1.2M+ Registered Users",
        disputes: "45K+ Resolved Disputes",
        khatians: "10M+ Verified Khatians",
      },
      faqHeading: "Frequently Asked Questions",
      faqs: {
        q1: "How do I reset a forgotten password?",
        a1: "You can click on 'Forgot Password' on the login page and follow the instructions.",
        q2: "How long does BhumiID verification take?",
        a2: "Usually within 24-48 hours after all documents are uploaded.",
        q3: "How do I check my namjari application status?",
        a3: "Log into the Citizen Portal and check the 'Mutations' tab.",
        q4: "How do I file an urgent land-occupation report?",
        a4: "Use the 'Land Occupation Panic Report' service to file immediately.",
      },
      faqSeeMore: "See more",
      natureAltPaddy: "Lush green paddy field in rural Bangladesh",
      natureAltRiver: "Peaceful river in the Bangladesh countryside",
      natureAltPath: "Village path lined with palm trees",
      footer: {
        linksHeading: "Important Links",
        linkNationalPortal: "Bangladesh National Portal",
        linkLandMinistry: "Ministry of Land",
        linkInfoDirectorate: "Information Directorate",
        linkGrievance: "Grievance Redress System",
        linkPrivacy: "Privacy Policy",
        linkFaq: "General FAQ",
        linkContact: "Contact",
        planHeading: "Planning & Implementation",
        planProjectName: "BhumiSetu Project",
        planDeptName: "Ministry of Land, Government of Bangladesh",
        downloadHeading: "Download the App",
        downloadGooglePlay: "Get it on Google Play",
        downloadAppStore: "Download on App Store",
        socialHeading: "Follow Us",
        techSupportLabel: "Technical Support By",
        techPartner1: "PlotGuard",
        techPartner2: "TechBD",
        techPartner3: "DataForge",
        copyright: "Copyright © 2026 BhumiSetu",
      },
    },

    // <<PAGES-END>>
  },

  components: {
    parcelCard: {
      registeredIn: (year: number) => `Reg. ${d(year)}`,
      openDisputes: (count: number) => `${n(count)} open`,
    },
    disputeListItem: {
      dag: (dagNo: string) => `Dag ${dagNo}`,
      updated: (ago: string) => `Updated ${ago}`,
    },
    comingSoon: {
      readyToBuild: "Ready to build",
      defaultNote:
        "This route is scaffolded. Compose it from the shared UI kit and the typed query hooks in hooks/queries.ts.",
    },
  },
};

/**
 * The shape every other locale must satisfy. Declared here rather than in the
 * barrel so `bn.ts` can import it without a cycle through the barrel's own
 * import of `bn`.
 */
export type Dictionary = typeof en;
