// Einheitlicher Rückgabetyp für Formular-Actions, die mit useActionState
// verwendet werden. Alle Felder optional, damit {} als Initialwert passt.
// `message` erlaubt eine präzisere Erfolgsmeldung als der Standardtext
// (z. B. „3 Überkategorien angelegt, 11 Kategorien zugeordnet.").
export type FormState = { error?: string; ok?: boolean; message?: string };
