// Présence en direct des classes virtuelles. La plateforme fournit un `LiveFeed` branché sur les événements du fournisseur
// (Zoom : arrivées et départs reçus par le serveur, voir docs/CLASSE_VIRTUELLE_ZOOM.md). `demoFeed` est une SIMULATION pour
// visualiser l'écran : données fictives, jamais utilisée sans que l'utilisateur la demande.
export type LiveState = "connected" | "waiting" | "left";
/** Coordonnées : fournies par la plateforme (fiche de l'apprenant ou du formateur) ; données personnelles, réservées aux organisateurs habilités. */
export type LiveContact = { joinUrl?: string; phone?: string; email?: string; profession?: string };
export type LiveParticipant = { id: string; name: string; state: LiveState } & LiveContact;
export type LiveClass = { id: string; title: string; trainer: string; trainerConnected: boolean; trainerContact?: LiveContact; joinUrl?: string; start: number; durationMin: number; participants: LiveParticipant[] };
