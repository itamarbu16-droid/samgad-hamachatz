export const unitRoles = [
  { id: "company-a", title: "סמ״פ א׳", emails: ["company.a@samgad.example"] },
  { id: "company-b", title: "סמ״פ ב׳", emails: ["company.b@samgad.example"] },
  { id: "company-c", title: "סמ״פ ג׳", emails: ["company.c@samgad.example"] },
  { id: "company-d", title: "סמ״פ ד׳", emails: ["company.d@samgad.example"] },
  { id: "cma", title: "סמ״פ צמ״ה", emails: ["logistics@samgad.example"] },
  {
    id: "hurricane",
    title: "סמ״פ הוריקן",
    emails: ["hurricane@samgad.example"],
  },
  {
    id: "deputies",
    title: "סמ״פים (קבוצה)",
    emails: [
      "company.a@samgad.example",
      "company.b@samgad.example",
      "company.c@samgad.example",
      "company.d@samgad.example",
      "logistics@samgad.example",
      "hurricane@samgad.example",
    ],
  },
  {
    id: "communications",
    title: "סקשר״גית",
    emails: ["contributor@samgad.example"],
  },
  { id: "medical", title: "ממחגית", emails: ["medical@samgad.example"] },
] as const;
export function isPersonalItem(
  item: { creatorId: string; assigneeIds: string[] },
  userId: string,
) {
  return (
    item.creatorId === userId &&
    item.assigneeIds.length === 1 &&
    item.assigneeIds[0] === userId
  );
}
