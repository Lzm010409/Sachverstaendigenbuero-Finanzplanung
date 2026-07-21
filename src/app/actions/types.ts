// Einheitlicher Rückgabetyp für Formular-Actions, die mit useActionState
// verwendet werden. Alle Felder optional, damit {} als Initialwert passt.
export type FormState = { error?: string; ok?: boolean };
