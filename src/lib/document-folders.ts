export const documentFolders = [
  { id: "trackers", name: "מעקבים", parent: null, section: "library" },
  { id: "orders", name: "פקודות", parent: null, section: "library" },
  { id: "checks", name: "בד״חים", parent: null, section: "library" },
  { id: "formats", name: "פורמטים", parent: null, section: "library" },
  {
    id: "formats-meetings",
    name: "ישיבות",
    parent: "formats",
    section: "library",
  },
  {
    id: "formats-general",
    name: "כללי",
    parent: "formats",
    section: "library",
  },
  { id: "procedures", name: "נהלים", parent: null, section: "library" },
  {
    id: "procedures-operational",
    name: "מבצעיים",
    parent: "procedures",
    section: "library",
  },
  {
    id: "procedures-routine",
    name: "נהלי שגרה",
    parent: "procedures",
    section: "library",
  },
  { id: "meetings", name: "סיכומי ישיבות", parent: null, section: "records" },
  {
    id: "meeting-deputies-brief",
    name: "קפ״ק סגנים",
    parent: "meetings",
    section: "records",
  },
  {
    id: "meeting-deputies",
    name: "ישיבת סגנים",
    parent: "meetings",
    section: "records",
  },
  {
    id: "meeting-safety",
    name: "ועדת בטיחות",
    parent: "meetings",
    section: "records",
  },
  {
    id: "meeting-drivers",
    name: "כנס נהגים נוהגים",
    parent: "meetings",
    section: "records",
  },
  {
    id: "inspections",
    name: "סיכום ביקורות",
    parent: null,
    section: "records",
  },
  {
    id: "inspection-armory",
    name: "ביקורת נשקייה",
    parent: "inspections",
    section: "records",
  },
  {
    id: "inspection-bunker",
    name: "ביקורת בונקר",
    parent: "inspections",
    section: "records",
  },
  {
    id: "inspection-ks",
    name: "ביקורת כ״ס",
    parent: "inspections",
    section: "records",
  },
] as const;
export type DocumentSection = "library" | "records";
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
export const MAX_DOCUMENT_TOTAL_BYTES = 100 * 1024 * 1024;
export const INLINE_DOCUMENT_BYTES = 3 * 1024 * 1024;
export const DOCUMENT_CHUNK_BYTES = 1024 * 1024;
export const documentExtensions = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain",
  csv: "text/csv",
  rtf: "application/rtf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
} as const;
export function folderPath(id: string): string {
  const folder = documentFolders.find((folder) => folder.id === id);
  if (!folder) return "";
  return folder.parent
    ? `${folderPath(folder.parent)} / ${folder.name}`
    : folder.name;
}
export function descendants(id: string): string[] {
  return [
    id,
    ...documentFolders
      .filter((folder) => folder.parent === id)
      .flatMap((folder) => descendants(folder.id)),
  ];
}
