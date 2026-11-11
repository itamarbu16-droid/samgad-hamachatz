import {mentionsRole} from "./schedule";
export const unitRoles = [
  { id: 'company-a', title: 'סמ״פ א׳', emails: ['company.a@samgad.example'] },
  { id: 'company-b', title: 'סמ״פ ב׳', emails: ['company.b@samgad.example'] },
  { id: 'company-c', title: 'סמ״פ ג׳', emails: ['company.c@samgad.example'] },
  { id: 'company-d', title: 'סמ״פ ד׳', emails: ['company.d@samgad.example'] },
  { id: 'company-e', title: 'סמ״פ ה׳', emails: [] },
  { id: 'cma', title: 'סמ״פ צמ״ה', emails: ['logistics@samgad.example'] },
  { id: 'sampam', title: 'סמפ״מ', emails: [] },
  { id: 'deputies', title: 'סמ״פים (קבוצה)', emails: [] },
  { id: 'communications', title: 'סקשר״גית', emails: ['contributor@samgad.example'] },
  { id: 'medical', title: 'ממחגית', emails: ['medical@samgad.example'] },
  { id: 'logistics', title: 'קל״ג', emails: [] },
  { id: 'operations', title: 'קמב״צית', emails: [] },
  { id: 'adjutant', title: 'חוג״ד', emails: [] },
  { id: 'staff-2', title: 'מטה 2', emails: [] },
] as const;
export const roleCollections: Record<string, readonly string[]> = {
  'סמ״פים': ['סמ״פ א׳', 'סמ״פ ב׳', 'סמ״פ ג׳', 'סמ״פ ד׳', 'סמ״פ ה׳', 'סמ״פ צמ״ה', 'סמפ״מ'],
  'מטה 2': ['סקשר״גית', 'ממחגית', 'קל״ג', 'קמב״צית', 'חוג״ד'],
};
export const roleName = (name: string) => name.replace(/\s*\(קבוצה\)\s*$/, '').trim();
/** Group membership follows the individual role slots, rather than a stale copied roster. */
export function expandRoleGroups<T extends {name:string;emails:string[];customized?:boolean}>(groups:T[], members:Array<string|{email:string;name:string}>) {
  const allowed = new Set(members.map(member=>(typeof member==='string'?member:member.email).toLowerCase()));
  const individual = groups.map(group=>{
    const explicit=group.emails.map(email=>email.toLowerCase()).filter(email=>allowed.has(email));
    const canonical=unitRoles.some(role=>roleName(role.title)===roleName(group.name));
    const inferred=canonical?members.flatMap(member=>typeof member!=='string'&&mentionsRole(member.name,roleName(group.name))?[member.email.toLowerCase()]:[]):[];
    return {...group,emails:group.customized?explicit:explicit.length?explicit:inferred};
  });
  return individual.map(group => {
    const roles = group.customized?undefined:roleCollections[roleName(group.name)];
    const emails = roles ? individual.filter(other=>roles.includes(roleName(other.name))).flatMap(other=>other.emails) : group.emails;
    return {...group, emails:[...new Set(emails.filter(email=>allowed.has(email)))]};
  });
}
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
