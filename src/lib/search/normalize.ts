export function normalizeSearch(value:string){return value.normalize("NFD").replace(/\p{Diacritic}/gu,"").toUpperCase().replace(/[^A-Z0-9]/g,"")}
export function normalizeTireMeasure(value:string){return normalizeSearch(value).replace("R","")}
