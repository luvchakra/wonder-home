/**
 * One area's words (story 22-004): the English object is the source, and each
 * other language carries every one of its keys — plus any extra plural forms
 * (`#two`, `#few`, …) the language needs. Areas live in their own files so a
 * screen's words can be added without touching every other screen's.
 */
export type AreaCatalog<T> = Record<keyof T, string> & { readonly [pluralForm: string]: string };
